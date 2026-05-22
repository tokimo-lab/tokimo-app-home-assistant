//! PostgreSQL pool for the Home Assistant app.
//!
//! Connects with `DATABASE_URL`; reads the per-app schema name from the
//! `TOKIMO_APP_SCHEMA` env var injected by the host (falls back to
//! `home_assistant` for standalone dev runs). Schema creation and migration
//! application are owned by the host migrator — this process never issues DDL.
//!
//! `search_path` is set on every new connection so business code can reference
//! tables unqualified.

use std::str::FromStr;
use std::sync::Arc;

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::{ConnectOptions, Executor};
use tracing::info;

pub async fn init_pool() -> anyhow::Result<PgPool> {
    let url = std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
    let schema = std::env::var("TOKIMO_APP_SCHEMA").unwrap_or_else(|_| "home_assistant".to_string());

    info!(schema = %schema, "home-assistant: connecting to postgres");

    let mut opts = PgConnectOptions::from_str(&url)?;
    opts = opts
        .application_name("tokimo-app-home-assistant")
        .log_statements(tracing::log::LevelFilter::Debug);

    // sqlx 0.8 `after_connect` takes `FnMut`, so the closure may be invoked
    // more than once. Wrap the schema name in `Arc<String>` so each invocation
    // can cheaply clone its handle into the returned future.
    let schema_arc: Arc<String> = Arc::new(schema);

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .after_connect(move |conn, _meta| {
            let s = Arc::clone(&schema_arc);
            Box::pin(async move {
                // Schema name is validated by the host migrator (`^[a-z_][a-z0-9_]*$`).
                let stmt = format!("SET search_path TO \"{}\", public", s);
                conn.execute(stmt.as_str()).await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await?;

    Ok(pool)
}
