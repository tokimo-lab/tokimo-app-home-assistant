//! PostgreSQL pool + schema bootstrap for the Home Assistant app.
//!
//! Connects with `DATABASE_URL`; ensures `DB_SCHEMA` (default: `home_assistant`) exists;
//! sets `search_path` on every new connection; applies the consolidated init SQL.
//!
//! HA app is in active development: we ship a single `migrations/0001_init.sql`
//! with the final schema state and no per-version ledger. Schema files use
//! `CREATE … IF NOT EXISTS`, so re-running on an existing schema is a no-op.

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::{ConnectOptions, Executor};
use std::str::FromStr;
use tracing::info;

pub async fn init_pool() -> anyhow::Result<PgPool> {
    let url = std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
    let schema = std::env::var("DB_SCHEMA").unwrap_or_else(|_| "home_assistant".to_string());

    info!(schema = %schema, "home-assistant: connecting to postgres");

    let mut opts = PgConnectOptions::from_str(&url)?;
    opts = opts
        .application_name("tokimo-app-home-assistant")
        .log_statements(tracing::log::LevelFilter::Debug);

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .after_connect(move |conn, _meta| {
            let schema = schema.clone();
            Box::pin(async move {
                let stmt = format!("SET search_path TO \"{schema}\", public");
                conn.execute(stmt.as_str()).await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    let schema = std::env::var("DB_SCHEMA").unwrap_or_else(|_| "home_assistant".to_string());

    let create = format!("CREATE SCHEMA IF NOT EXISTS \"{schema}\"");
    sqlx::query(&create).execute(pool).await?;

    info!("home-assistant: applying 0001_init.sql");
    sqlx::raw_sql(include_str!("../migrations/0001_init.sql"))
        .execute(pool)
        .await?;

    Ok(())
}
