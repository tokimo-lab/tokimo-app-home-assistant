//! Home Assistant app — axum + bus data-plane multi-process app.
//!
//! Boot flow:
//! 1. Connect PostgreSQL (schema + migrations already applied by the host migrator).
//! 2. Build ConnectionPool, load all instances from DB, spawn a supervisor per instance.
//! 3. Bind axum router on bus data-plane socket; report the socket to broker via `data_plane_socket`.
//! 4. BusClient keeps the app alive (supervisor health-check ping).
//!
//! TODO: enforce admin role at server proxy layer (central server must verify admin claim
//!       before forwarding requests to `/api/apps/home-assistant/...`).

/// Compile-time embedded app manifest, used by the db module to read the schema name.
const MANIFEST: &str = include_str!("../tokimo-app.toml");

mod app_server;
mod assets;
mod cli;
mod db;
mod error;
mod ha;
mod handlers;
mod state;
mod tls;

use std::sync::{Arc, OnceLock};

use clap::{Parser, Subcommand};
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(
    name = "tokimo-app-home-assistant",
    about = "Home Assistant — Tokimo 子 app CLI",
    long_about = "Home Assistant CLI — 通过 Tokimo 主 server 调用 home-assistant app。\n\n前置条件：\n1. 启动 Tokimo 主 server (默认 http://localhost:5678)\n2. 浏览器登录后，去「设置 → API Keys」创建一个 token (mm_xxx)\n3. 把 token 通过 --tokimo-token 或 TOKIMO_TOKEN env 传入",
    term_width = 100
)]
struct Cli {
    #[command(flatten)]
    auth: TokimoAuthArgs,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
pub(crate) enum Command {
    /// 检查 Home Assistant CLI 状态。
    Status,
}

#[tokio::main]
async fn main() {
    let Cli { auth, command } = Cli::parse();

    match command {
        None if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() => {
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "info,tokimo_bus_client=info,tokimo_app_home_assistant=debug".into()),
                )
                .init();

            if let Err(error) = run_server().await {
                error!(%error, "home-assistant: fatal");
                std::process::exit(1);
            }
        }
        None => {
            use clap::CommandFactory;
            let mut cmd = Cli::command();
            tokimo_bus_cli::print_help_unified(&mut cmd);
            std::process::exit(0);
        }
        Some(cmd) => {
            if let Err(error) = cli::run(auth, cmd).await {
                eprintln!("Error: {error:#}");
                std::process::exit(1);
            }
        }
    }
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "home-assistant: connecting to broker");

    let pool = db::init_pool().await?;
    info!("home-assistant: db connected (schema managed by host)");

    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());

    // Build ConnectionPool and load existing instances from DB.
    let conn_pool = state::ConnectionPool::new(pool.clone()).await?;
    info!("home-assistant: connection pool ready ({} instances)", conn_pool.len());

    let ctx = Arc::new(handlers::AppCtx {
        pool,
        conn_pool,
        client: Arc::clone(&client_slot),
    });

    // Spawn UDS axum server.
    let app_socket = app_server::spawn("home-assistant", Arc::clone(&ctx))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    // Register with broker.
    let client = BusClient::builder(cfg)
        .service("home-assistant", env!("CARGO_PKG_VERSION"))
        .data_plane(app_socket)
        .build()
        .await
        .map_err(|e| anyhow::anyhow!("bus build: {e}"))?;
    client_slot
        .set(Arc::clone(&client))
        .map_err(|_| anyhow::anyhow!("client_slot already set"))?;

    info!("home-assistant: registered with broker");

    let shutdown = {
        let client = Arc::clone(&client);
        tokio::spawn(async move { client.run_until_shutdown().await })
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("home-assistant: SIGINT received");
            client.shutdown();
        }
        _ = shutdown => info!("home-assistant: broker sent Shutdown"),
    }

    Ok(())
}
