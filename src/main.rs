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
#[cfg(unix)]
mod protocol;
mod state;
mod tls;
#[cfg(unix)]
mod uds_client;
#[cfg(unix)]
mod uds_server;

use std::sync::{Arc, OnceLock};

use clap::{Parser, Subcommand};
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(
    name = "tokimo-app-home-assistant",
    about = "Home Assistant — Tokimo 子 app CLI",
    long_about = "Home Assistant CLI — 通过 Tokimo 主 server 调用 home-assistant app。",
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
    /// 检查连接状态，列出实例及域统计。
    Status,
    /// 列出所有 Home Assistant 实例。
    Instances,
    /// 测试指定实例的连通性。
    Test {
        /// 实例 ID
        id: uuid::Uuid,
    },
    /// 按 entity_id 或 friendly_name 搜索实体。
    Search {
        /// 搜索关键词（匹配 entity_id 和 friendly_name，空格分词 AND 匹配）
        query: String,
        /// 实例 ID（可选，默认搜索所有实例）
        #[arg(short, long)]
        instance: Option<uuid::Uuid>,
        /// 按域过滤（逗号分隔，如 "light,switch"）
        #[arg(short, long)]
        domain: Option<String>,
        /// 按状态过滤（逗号分隔，如 "on,off"）
        #[arg(short, long)]
        state: Option<String>,
        /// 包含隐藏实体
        #[arg(long)]
        include_hidden: bool,
        /// 返回结果数量上限
        #[arg(short, long, default_value_t = 50)]
        limit: u32,
        /// 输出原始 JSON
        #[arg(long)]
        raw: bool,
    },
    /// 查看单个实体的详细信息（含设备元数据）。
    Entity {
        /// 实例 ID
        instance_id: uuid::Uuid,
        /// 实体 ID（如 "light.kitchen"）
        entity_id: String,
        /// 输出原始 JSON
        #[arg(long)]
        raw: bool,
    },
    /// 调用 Home Assistant service（如 light.turn_on, lock.lock）。
    Call {
        /// 域名（如 "light", "switch", "climate"）
        domain: String,
        /// 服务名（如 "turn_on", "turn_off", "toggle"）
        service: String,
        /// 目标实体 ID（如 "light.kitchen"）
        #[arg(long = "entity-id")]
        entity_id: String,
        /// 实例 ID（可选，默认使用第一个实例）
        #[arg(short, long)]
        instance: Option<uuid::Uuid>,
        /// 额外参数（JSON 格式，如 '{"brightness":128}'）
        #[arg(long)]
        data: Option<String>,
    },
    /// 查看实例摘要（不可用实体、域分布统计）。
    Summary {
        /// 实例 ID
        instance_id: uuid::Uuid,
        /// 输出原始 JSON
        #[arg(long)]
        raw: bool,
    },
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

    // Spawn UDS axum server (for broker communication).
    let app_socket = app_server::spawn("home-assistant", Arc::clone(&ctx))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    // Spawn UDS server for CLI communication (Unix domain sockets, Unix-only).
    #[cfg(unix)]
    if let Err(e) = uds_server::spawn(Arc::clone(&ctx)).await {
        tracing::warn!(error = %e, "uds-server: failed to start, CLI will use direct mode");
    }
    #[cfg(not(unix))]
    tracing::warn!("uds-server: unavailable on this platform, CLI will use direct mode");

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
