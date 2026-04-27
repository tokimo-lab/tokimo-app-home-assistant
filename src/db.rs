//! PostgreSQL pool + migrations for the Home Assistant app.
//!
//! Connects with `DATABASE_URL`; ensures `DB_SCHEMA` (default: `home_assistant`) exists;
//! sets `search_path` on every new connection; applies embedded migrations.

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::{ConnectOptions, Executor, Row};
use std::str::FromStr;
use tracing::{debug, info};

const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init", include_str!("../migrations/0001_init.sql")),
    (
        "0002_rooms_instance_id",
        include_str!("../migrations/0002_rooms_instance_id.sql"),
    ),
];

pub async fn init_pool() -> anyhow::Result<PgPool> {
    let url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
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

    // Idempotent schema bootstrap.
    let create = format!("CREATE SCHEMA IF NOT EXISTS \"{schema}\"");
    sqlx::query(&create).execute(pool).await?;

    // Migration ledger lives inside the app's own schema.
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS _migrations (
            id          TEXT PRIMARY KEY,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
    )
    .execute(pool)
    .await?;

    for (id, sql) in MIGRATIONS {
        let exists: bool = sqlx::query("SELECT EXISTS(SELECT 1 FROM _migrations WHERE id = $1)")
            .bind(id)
            .fetch_one(pool)
            .await?
            .try_get(0)?;
        if exists {
            debug!(migration = %id, "skip (already applied)");
            continue;
        }
        info!(migration = %id, "applying");
        let mut tx = pool.begin().await?;
        sqlx::raw_sql(sql).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO _migrations(id) VALUES ($1)")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }

    Ok(())
}
