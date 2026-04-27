//! Home Assistant app — axum + UDS multi-process app (方案 3).
//!
//! Boot flow:
//! 1. Connect PostgreSQL, run migrations.
//! 2. Build ConnectionPool, load all instances from DB, spawn a supervisor per instance.
//! 3. Bind axum router on UDS; report the socket to broker via `data_plane_socket`.
//! 4. BusClient keeps the app alive (supervisor health-check ping).
//!
//! TODO: enforce admin role at server proxy layer (central server must verify admin claim
//!       before forwarding requests to `/api/apps/home-assistant/...`).

mod app_server;
mod assets;
mod db;
mod error;
mod ha;
mod handlers;
mod state;
mod tls;

use std::sync::{Arc, OnceLock};

use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tokimo_bus_client=info,tokimo_app_home_assistant=debug".into()),
        )
        .init();

    if let Err(e) = run().await {
        error!(error = %e, "home-assistant: fatal");
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "home-assistant: connecting to broker");

    let pool = db::init_pool().await?;
    db::run_migrations(&pool).await?;
    info!("home-assistant: db ready");

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
