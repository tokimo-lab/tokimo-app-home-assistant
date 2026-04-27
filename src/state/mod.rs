//! In-memory state for all HA instances.
//!
//! `ConnectionPool` owns a `DashMap<Uuid, Arc<InstanceCtx>>`. Each instance
//! has an `InstanceCtx` with its live entity store, a broadcast channel for
//! SSE clients, and a `CancellationToken` for clean shutdown.
//!
//! `ConnectionPool::new()` loads all rows from the DB and spawns a supervisor
//! per instance. Supervisors are fully detached (errors are logged, never
//! propagated) so one offline HA cannot block others.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize, Serializer};
use sqlx::PgPool;
use tokio::sync::{Notify, RwLock, broadcast};
use tracing::{info, warn};
use uuid::Uuid;

use crate::ha::ws;

// ─── Simple cancellation token (no tokio-util dep required) ──────────────────

/// Lightweight cancellation: set a flag + wake any waiting tasks.
pub struct CancelToken {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cancelled: AtomicBool::new(false),
            notify: Notify::new(),
        })
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    /// Async wait until cancelled (returns immediately if already cancelled).
    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        // Loop to handle spurious wakeups.
        loop {
            let notified = self.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
            if self.is_cancelled() {
                return;
            }
        }
    }
}

// ─── Public domain types ──────────────────────────────────────────────────────

/// A single HA entity state (mirrors the HA WS / REST payload).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EntityState {
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
    pub last_changed: String,
    pub last_updated: String,
    pub context: Option<serde_json::Value>,
}

/// Events broadcast to SSE subscribers.
#[derive(Debug, Clone)]
pub enum EntityEvent {
    /// Full state dump on (re-)connect.
    Snapshot(Vec<EntityState>),
    /// A single entity was added or changed.
    Updated {
        entity: Box<EntityState>,
        /// `event.context.id` from the HA `state_changed` event, if present.
        /// The frontend uses this to ack-reconcile pending optimistic
        /// `call_service` updates.
        context_id: Option<String>,
    },
    /// An entity was removed.
    Removed(String),
    /// Connection status changed.
    Status(Arc<ConnStatus>),
}

/// Current connection status of one instance's WS supervisor.
///
/// Serializes to a frontend-friendly shape:
///   - `"connecting"` / `"connected"` / `"disconnected"` for transient states
///   - `{"error": "<reason>"}` for `Failed`
///
/// `Disconnected { since, reason }` collapses to the bare `"disconnected"`
/// string; the structured info is kept only for backend logging / future use.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ConnStatus {
    Connecting,
    Connected,
    Disconnected { since: DateTime<Utc>, reason: String },
    Failed(String),
}

impl Serialize for ConnStatus {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            ConnStatus::Connecting => s.serialize_str("connecting"),
            ConnStatus::Connected => s.serialize_str("connected"),
            ConnStatus::Disconnected { .. } => s.serialize_str("disconnected"),
            ConnStatus::Failed(msg) => {
                let mut m = s.serialize_map(Some(1))?;
                m.serialize_entry("error", msg)?;
                m.end()
            }
        }
    }
}

// ─── Instance config (read-locked, cheap Arc clone on hot path) ───────────────

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct InstanceConfig {
    pub base_url: String,
    pub access_token: String,
    pub verify_tls: bool,
}

// ─── Per-entity in-memory store ───────────────────────────────────────────────

pub struct EntityStore {
    pub states: DashMap<String, EntityState>,
    /// Broadcast sender for SSE clients. Capacity 1024.
    pub tx: broadcast::Sender<EntityEvent>,
}

impl EntityStore {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self {
            states: DashMap::new(),
            tx,
        }
    }
}

// ─── InstanceCtx ─────────────────────────────────────────────────────────────

pub struct InstanceCtx {
    pub id: Uuid,
    /// Current config — Arc-swapped on PATCH so reads never block writers long.
    pub config: RwLock<Arc<InstanceConfig>>,
    /// Per-instance HTTP client honoring `verify_tls`.
    pub http: reqwest::Client,
    /// Monotonically increasing; bumped on every config update so stale
    /// supervisor tasks can detect they should exit.
    pub generation: AtomicU64,
    /// Cancellation token for the supervisor task.
    pub cancel: Arc<CancelToken>,
    /// Live entity store.
    pub store: EntityStore,
    /// Last-known connection status.
    pub status: RwLock<Arc<ConnStatus>>,
}

impl InstanceCtx {
    pub fn new(id: Uuid, config: InstanceConfig) -> Arc<Self> {
        let http = crate::tls::build_http_client(config.verify_tls);
        Arc::new(Self {
            id,
            config: RwLock::new(Arc::new(config)),
            http,
            generation: AtomicU64::new(0),
            cancel: CancelToken::new(),
            store: EntityStore::new(),
            status: RwLock::new(Arc::new(ConnStatus::Connecting)),
        })
    }
}

// ─── ConnectionPool ───────────────────────────────────────────────────────────

/// Owns all per-instance live state.
pub struct ConnectionPool {
    pub instances: DashMap<Uuid, Arc<InstanceCtx>>,
    pub pool: PgPool,
}

impl ConnectionPool {
    /// Create a new pool, load instances from DB, and spawn supervisors.
    pub async fn new(pool: PgPool) -> anyhow::Result<Arc<Self>> {
        let cp = Arc::new(Self {
            instances: DashMap::new(),
            pool: pool.clone(),
        });

        // Load all instances from DB and spawn supervisors.
        let rows = sqlx::query_as::<_, (Uuid, String, String, bool)>(
            "SELECT id, base_url, access_token, verify_tls FROM instances ORDER BY created_at",
        )
        .fetch_all(&pool)
        .await?;

        for (id, base_url, access_token, verify_tls) in rows {
            let config = InstanceConfig {
                base_url,
                access_token,
                verify_tls,
            };
            let ctx = InstanceCtx::new(id, config);
            cp.instances.insert(id, Arc::clone(&ctx));
            spawn_supervisor(Arc::clone(&ctx), pool.clone());
        }

        Ok(cp)
    }

    pub fn len(&self) -> usize {
        self.instances.len()
    }

    /// Insert a new instance and start its supervisor.
    pub fn add_instance(&self, ctx: Arc<InstanceCtx>) {
        let pool = self.pool.clone();
        let ctx_clone = Arc::clone(&ctx);
        self.instances.insert(ctx.id, ctx);
        spawn_supervisor(ctx_clone, pool);
    }

    /// Cancel the supervisor for `id` and remove from the map.
    pub fn remove_instance(&self, id: Uuid) {
        if let Some((_, ctx)) = self.instances.remove(&id) {
            ctx.cancel.cancel();
        }
    }

    /// Replace config and restart supervisor (cancel old token, fresh InstanceCtx).
    pub async fn restart_instance(&self, id: Uuid, new_config: InstanceConfig) {
        // Cancel old supervisor first.
        if let Some((_, old_ctx)) = self.instances.remove(&id) {
            old_ctx.cancel.cancel();
        }

        // Create fresh InstanceCtx (new CancelToken + empty store).
        let new_ctx = InstanceCtx::new(id, new_config);
        self.instances.insert(id, Arc::clone(&new_ctx));
        spawn_supervisor(new_ctx, self.pool.clone());
    }
}

// ─── Supervisor task ──────────────────────────────────────────────────────────

/// Spawn a fully detached supervisor task for `instance`.
/// Errors are logged; the app process continues regardless.
pub fn spawn_supervisor(instance: Arc<InstanceCtx>, pool: PgPool) {
    tokio::spawn(async move {
        let id = instance.id;
        let current_gen = instance.generation.load(Ordering::SeqCst);
        info!(instance_id = %id, gen = current_gen, "supervisor: starting");

        let mut backoff = Duration::from_secs(1);

        loop {
            if instance.cancel.is_cancelled() {
                info!(instance_id = %id, "supervisor: cancelled, exiting");
                return;
            }
            // Stale check: if generation changed a newer supervisor was spawned.
            if instance.generation.load(Ordering::SeqCst) != current_gen {
                info!(instance_id = %id, "supervisor: generation changed, exiting stale task");
                return;
            }

            // Update status → Connecting.
            {
                let mut status = instance.status.write().await;
                *status = Arc::new(ConnStatus::Connecting);
            }
            let _ = instance
                .store
                .tx
                .send(EntityEvent::Status(Arc::new(ConnStatus::Connecting)));

            match ws::run_connection(Arc::clone(&instance), pool.clone()).await {
                Ok(()) => {
                    // Clean cancellation — exit.
                    info!(instance_id = %id, "supervisor: clean exit");
                    return;
                }
                Err(e) => {
                    if instance.cancel.is_cancelled() {
                        return;
                    }
                    warn!(instance_id = %id, error = %e, delay = ?backoff, "supervisor: connection error, retrying");

                    let since = Utc::now();
                    let reason = e.to_string();
                    {
                        let mut status = instance.status.write().await;
                        *status = Arc::new(ConnStatus::Disconnected {
                            since,
                            reason: reason.clone(),
                        });
                    }
                    let _ = instance
                        .store
                        .tx
                        .send(EntityEvent::Status(Arc::new(ConnStatus::Disconnected {
                            since,
                            reason,
                        })));

                    // Exponential backoff capped at 30s.
                    tokio::select! {
                        _ = tokio::time::sleep(backoff) => {}
                        _ = instance.cancel.cancelled() => return,
                    }
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
            }

            if instance.generation.load(Ordering::SeqCst) != current_gen {
                return;
            }
        }
    });
}
