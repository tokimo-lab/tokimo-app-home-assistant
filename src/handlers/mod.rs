//! Axum handlers for the Home Assistant app.
//!
//! Split into sub-modules by concern:
//!   - `instances`  — CRUD + test + status
//!   - `entities`   — entity listing, overrides
//!   - `rooms`      — local rooms + sync_areas
//!   - `services`   — HA service calls
//!   - `sse`        — SSE data plane
//!
//! `AppCtx` is the shared state injected via `State<Arc<AppCtx>>`.

pub mod display;
pub mod entities;
pub mod instances;
pub mod rooms;
pub mod services;
pub mod sse;

use std::sync::{Arc, OnceLock};

use serde::Serialize;
use sqlx::PgPool;
use tokimo_bus_client::BusClient;

use crate::state::ConnectionPool;

/// Shared application context injected into every handler.
#[allow(dead_code)]
pub struct AppCtx {
    pub pool: PgPool,
    pub conn_pool: Arc<ConnectionPool>,
    pub client: Arc<OnceLock<Arc<BusClient>>>,
}

// ─── Token masking ────────────────────────────────────────────────────────────

/// Wraps a secret token and serializes as `••••<last4>` so it is never
/// included verbatim in any HTTP response.
#[derive(Debug, Clone)]
pub struct MaskedToken(pub String);

impl Serialize for MaskedToken {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let last4 = &self.0[self.0.len().saturating_sub(4)..];
        s.serialize_str(&format!("••••{last4}"))
    }
}

// ─── Shared DTOs ─────────────────────────────────────────────────────────────

/// Instance row as returned by list/get — token is always masked.
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct InstanceDto {
    pub id: uuid::Uuid,
    pub name: String,
    pub base_url: String,
    pub access_token: MaskedToken,
    pub verify_tls: bool,
    /// Live connection status from the supervisor pool. Same shape as the SSE
    /// `status` event payload (string variants or `{"error": "..."}`).
    pub status: serde_json::Value,
    pub last_connected_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Read the current connection status for `id` from the pool.
/// Returns `"connecting"` (the initial state) when no supervisor exists yet
/// — e.g. the row is in the DB but `add_instance` hasn't been called.
pub async fn instance_status_value(ctx: &AppCtx, id: uuid::Uuid) -> serde_json::Value {
    if let Some(entry) = ctx.conn_pool.instances.get(&id) {
        let status = entry.value().status.read().await;
        serde_json::to_value(&**status).unwrap_or_else(|_| serde_json::Value::String("connecting".to_string()))
    } else {
        serde_json::Value::String("connecting".to_string())
    }
}

/// Get an HTTP client honoring the instance's `verify_tls` setting.
///
/// Prefers the live per-instance client owned by `InstanceCtx`. Falls back
/// to a fresh client built with the requested verification flag when the
/// instance is not registered with the connection pool yet.
pub fn instance_http_client(ctx: &AppCtx, id: uuid::Uuid, verify_tls: bool) -> reqwest::Client {
    if let Some(entry) = ctx.conn_pool.instances.get(&id) {
        return entry.value().http.clone();
    }
    crate::tls::build_http_client(verify_tls)
}
