//! Home Assistant WebSocket client (tokio-tungstenite).
//!
//! Implements the HA WS auth handshake, get_states bootstrap, state_changed
//! subscription, and ping/pong keepalive. Designed to run inside a supervisor
//! task managed by `state::ConnectionPool`.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use tracing::{debug, info, warn};

use crate::error::AppError;
use crate::state::{ConnStatus, EntityEvent, EntityState, InstanceCtx};

// ─── WS message shapes ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct WsMsg {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    id: Option<u64>,
    success: Option<bool>,
    result: Option<serde_json::Value>,
    event: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct StateChangedData {
    entity_id: String,
    new_state: Option<EntityState>,
}

// ─── Supervisor loop ─────────────────────────────────────────────────────────

/// Run one connection attempt: connect, authenticate, bootstrap, subscribe,
/// then loop reading events.  Returns an error on connection failure / auth
/// failure / protocol violation. The caller handles backoff and cancellation.
pub async fn run_connection(instance: Arc<InstanceCtx>, pool: sqlx::PgPool) -> anyhow::Result<()> {
    // Build WS URL from base_url.
    let (base_url, access_token, verify_tls) = {
        let cfg = instance.config.read().await;
        (cfg.base_url.clone(), cfg.access_token.clone(), cfg.verify_tls)
    };

    let ws_url = to_ws_url(&base_url)?;
    info!(instance_id = %instance.id, %ws_url, verify_tls, "HA WS: connecting");

    let connector = crate::tls::ws_connector(verify_tls);

    // Connect — tokio-tungstenite handles TLS via rustls. When verify_tls is
    // false we pass a custom Connector that accepts any cert.
    let (mut stream, _) = timeout(
        Duration::from_secs(15),
        connect_async_tls_with_config(&ws_url, None, false, connector),
    )
    .await
    .map_err(|_| anyhow::anyhow!("WS connect timed out"))?
    .map_err(|e| anyhow::anyhow!("WS connect failed: {e}"))?;

    // ── Auth handshake ──────────────────────────────────────────────────────

    // Expect: {"type":"auth_required"}
    let msg = read_msg(&mut stream).await?;
    if msg.kind != "auth_required" {
        anyhow::bail!("expected auth_required, got {}", msg.kind);
    }

    // Send: {"type":"auth","access_token":"..."}
    stream
        .send(Message::Text(
            json!({"type":"auth","access_token": access_token}).to_string(),
        ))
        .await
        .map_err(|e| anyhow::anyhow!("WS send auth: {e}"))?;

    // Expect: {"type":"auth_ok"}  or  {"type":"auth_invalid"}
    let msg = read_msg(&mut stream).await?;
    match msg.kind.as_str() {
        "auth_ok" => info!(instance_id = %instance.id, "HA WS: auth ok"),
        "auth_invalid" => anyhow::bail!("HA auth rejected (access token invalid)"),
        other => anyhow::bail!("unexpected message after auth: {other}"),
    }

    // ── Bootstrap: get_states ───────────────────────────────────────────────

    let id_get_states: u64 = 1;
    stream
        .send(Message::Text(
            json!({"id": id_get_states, "type": "get_states"}).to_string(),
        ))
        .await
        .map_err(|e| anyhow::anyhow!("WS send get_states: {e}"))?;

    let msg = read_msg(&mut stream).await?;
    if msg.id != Some(id_get_states) || msg.kind != "result" {
        anyhow::bail!("unexpected response to get_states");
    }
    if msg.success != Some(true) {
        anyhow::bail!("get_states returned success=false: {:?}", msg.error);
    }
    if let Some(result) = msg.result {
        let states: Vec<EntityState> =
            serde_json::from_value(result).map_err(|e| anyhow::anyhow!("parse states: {e}"))?;
        let snapshot = states.clone();
        instance.store.states.clear();
        for s in states {
            instance.store.states.insert(s.entity_id.clone(), s);
        }
        let _ = instance.store.tx.send(EntityEvent::Snapshot(snapshot));
        debug!(instance_id = %instance.id, count = instance.store.states.len(), "HA WS: states loaded");
    }

    // ── Subscribe to state_changed events ──────────────────────────────────

    let id_subscribe: u64 = 2;
    stream
        .send(Message::Text(
            json!({"id": id_subscribe, "type": "subscribe_events", "event_type": "state_changed"}).to_string(),
        ))
        .await
        .map_err(|e| anyhow::anyhow!("WS send subscribe_events: {e}"))?;

    let msg = read_msg(&mut stream).await?;
    if msg.id != Some(id_subscribe) || msg.kind != "result" || msg.success != Some(true) {
        anyhow::bail!("subscribe_events failed: {:?}", msg.error);
    }
    info!(instance_id = %instance.id, "HA WS: subscribed to state_changed");

    // ── Mark Connected ──────────────────────────────────────────────────────

    {
        let mut status = instance.status.write().await;
        *status = Arc::new(ConnStatus::Connected);
    }
    let _ = instance
        .store
        .tx
        .send(EntityEvent::Status(Arc::new(ConnStatus::Connected)));

    // Refresh device/entity registry caches in the background. Best-effort:
    // failures are logged but do not abort the event loop. Done after we
    // mark Connected so the SSE clients see status flip immediately.
    {
        let inst = Arc::clone(&instance);
        tokio::spawn(async move {
            if let Err(e) = refresh_registries(&inst).await {
                warn!(instance_id = %inst.id, error = %e.message, "HA WS: registry refresh failed");
            }
        });
    }

    // Update last_connected_at in DB (best-effort; do not abort supervisor on
    // failure — the live WS session is more important than the audit field).
    if let Err(e) = sqlx::query("UPDATE instances SET last_connected_at = NOW() WHERE id = $1")
        .bind(instance.id)
        .execute(&pool)
        .await
    {
        tracing::warn!(instance_id = %instance.id, error = %e, "HA WS: failed to update last_connected_at");
    }

    // ── Event loop with ping keepalive ─────────────────────────────────────

    let mut next_id: u64 = 3;
    let ping_interval = Duration::from_secs(25);
    let pong_timeout = Duration::from_secs(10);
    let mut interval = tokio::time::interval(ping_interval);
    interval.tick().await; // consume the immediate first tick

    loop {
        tokio::select! {
            _ = instance.cancel.cancelled() => {
                info!(instance_id = %instance.id, "HA WS: cancelled");
                return Ok(());
            }

            _ = interval.tick() => {
                let ping_id = next_id;
                next_id += 1;
                stream
                    .send(Message::Text(
                        json!({"id": ping_id, "type": "ping"}).to_string(),
                    ))
                    .await
                    .map_err(|e| anyhow::anyhow!("WS send ping: {e}"))?;

                // Wait for pong with timeout.
                let pong = timeout(pong_timeout, read_msg(&mut stream)).await;
                match pong {
                    Ok(Ok(m)) if m.kind == "pong" && m.id == Some(ping_id) => {
                        debug!(instance_id = %instance.id, "HA WS: pong ok");
                    }
                    Ok(Ok(m)) => {
                        // Could be an event that arrived right before pong — handle it too.
                        handle_event_msg(&instance, m);
                    }
                    Ok(Err(e)) => anyhow::bail!("WS read after ping: {e}"),
                    Err(_) => anyhow::bail!("pong timed out"),
                }
            }

            raw = stream.next() => {
                match raw {
                    None => anyhow::bail!("WS stream closed by server"),
                    Some(Err(e)) => anyhow::bail!("WS read error: {e}"),
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<WsMsg>(&text) {
                            Ok(msg) => handle_event_msg(&instance, msg),
                            Err(e) => warn!(instance_id = %instance.id, error = %e, "WS: parse error"),
                        }
                    }
                    Some(Ok(Message::Close(_))) => anyhow::bail!("WS closed by server"),
                    Some(Ok(_)) => {} // ignore binary / ping / pong frames
                }
            }
        }
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn handle_event_msg(instance: &Arc<InstanceCtx>, msg: WsMsg) {
    if msg.kind != "event" {
        return;
    }
    let Some(event_val) = msg.event else { return };

    let event_type = event_val.get("event_type").and_then(|v| v.as_str()).unwrap_or("");

    if event_type != "state_changed" {
        return;
    }

    // HA wraps the inner event with `context.id` at the top level.
    let context_id = event_val
        .get("context")
        .and_then(|c| c.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let data = event_val.get("data").cloned().unwrap_or(serde_json::Value::Null);
    match serde_json::from_value::<StateChangedData>(data) {
        Ok(changed) => {
            if let Some(new_state) = changed.new_state {
                // Build Arc once. Clone into DashMap (unavoidable), but broadcast clones only the Arc.
                let arc_state = Arc::new(new_state);
                instance
                    .store
                    .states
                    .insert(arc_state.entity_id.clone(), (*arc_state).clone());
                let _ = instance.store.tx.send(EntityEvent::Updated {
                    entity: arc_state,
                    context_id,
                });
            } else {
                instance.store.states.remove(&changed.entity_id);
                let _ = instance.store.tx.send(EntityEvent::Removed(changed.entity_id));
            }
        }
        Err(e) => warn!(instance_id = %instance.id, error = %e, "WS: state_changed parse error"),
    }
}

async fn read_msg<S>(stream: &mut S) -> anyhow::Result<WsMsg>
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        match stream.next().await {
            None => anyhow::bail!("WS stream closed unexpectedly"),
            Some(Err(e)) => anyhow::bail!("WS read: {e}"),
            Some(Ok(Message::Text(text))) => {
                let msg: WsMsg =
                    serde_json::from_str(&text).map_err(|e| anyhow::anyhow!("WS parse: {e} — raw: {text}"))?;
                return Ok(msg);
            }
            Some(Ok(Message::Close(_))) => anyhow::bail!("WS closed"),
            Some(Ok(_)) => {} // skip binary / control frames
        }
    }
}

/// One-shot WebSocket command against HA. Opens a short-lived WS, performs
/// auth handshake, issues a single command, returns the `result` field.
///
/// Used for registry endpoints (area / entity / device) that HA only exposes
/// over the WebSocket API — the equivalent REST paths return 404.
async fn ws_command(
    base_url: &str,
    access_token: &str,
    verify_tls: bool,
    command_type: &'static str,
) -> Result<serde_json::Value, AppError> {
    let ws_url = to_ws_url(base_url).map_err(|e| AppError::bad_gateway(format!("HA WS url: {e}")))?;
    debug!(%ws_url, verify_tls, command_type, "HA WS one-shot");

    let connector = crate::tls::ws_connector(verify_tls);
    let overall = Duration::from_secs(10);

    timeout(overall, async move {
        let (mut stream, _) = connect_async_tls_with_config(&ws_url, None, false, connector)
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS connect: {e}")))?;

        // auth_required
        let msg = read_msg(&mut stream)
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS read auth_required: {e}")))?;
        if msg.kind != "auth_required" {
            return Err(AppError::bad_gateway(format!(
                "HA WS expected auth_required, got {}",
                msg.kind
            )));
        }

        // auth
        stream
            .send(Message::Text(
                json!({"type":"auth","access_token": access_token}).to_string(),
            ))
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS send auth: {e}")))?;

        let msg = read_msg(&mut stream)
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS read auth response: {e}")))?;
        match msg.kind.as_str() {
            "auth_ok" => {}
            "auth_invalid" => return Err(AppError::unauthorized("HA rejected the access token")),
            other => {
                return Err(AppError::bad_gateway(format!(
                    "HA WS unexpected message after auth: {other}"
                )));
            }
        }

        // command
        let cmd_id: u64 = 1;
        stream
            .send(Message::Text(
                json!({"id": cmd_id, "type": command_type}).to_string(),
            ))
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS send {command_type}: {e}")))?;

        let msg = read_msg(&mut stream)
            .await
            .map_err(|e| AppError::bad_gateway(format!("HA WS read {command_type} result: {e}")))?;
        if msg.id != Some(cmd_id) || msg.kind != "result" {
            return Err(AppError::bad_gateway(format!(
                "HA WS unexpected response to {command_type} (kind={}, id={:?})",
                msg.kind, msg.id
            )));
        }
        if msg.success != Some(true) {
            return Err(AppError::bad_gateway(format!(
                "HA WS {command_type} failed: {:?}",
                msg.error
            )));
        }
        let result = msg
            .result
            .ok_or_else(|| AppError::bad_gateway(format!("HA WS {command_type} missing result")))?;

        // Best-effort close.
        let _ = stream.send(Message::Close(None)).await;

        Ok::<serde_json::Value, AppError>(result)
    })
    .await
    .map_err(|_| AppError::bad_gateway(format!("HA WS {command_type} timed out")))?
}

/// One-shot WebSocket fetch of HA's area registry.
pub async fn fetch_area_registry(
    base_url: &str,
    access_token: &str,
    verify_tls: bool,
) -> Result<serde_json::Value, AppError> {
    ws_command(base_url, access_token, verify_tls, "config/area_registry/list").await
}

/// One-shot WebSocket fetch of HA's entity registry. Each entry contains
/// `entity_id`, `area_id` (nullable), `device_id` (nullable), and more.
pub async fn fetch_entity_registry(
    base_url: &str,
    access_token: &str,
    verify_tls: bool,
) -> Result<serde_json::Value, AppError> {
    ws_command(base_url, access_token, verify_tls, "config/entity_registry/list").await
}

/// One-shot WebSocket fetch of HA's device registry. Each entry contains
/// `id` and `area_id` (nullable), used to resolve entity area inheritance.
pub async fn fetch_device_registry(
    base_url: &str,
    access_token: &str,
    verify_tls: bool,
) -> Result<serde_json::Value, AppError> {
    ws_command(base_url, access_token, verify_tls, "config/device_registry/list").await
}

/// Refresh the per-instance device & entity registry caches by issuing two
/// one-shot WS commands against HA. Both maps are atomically swapped on
/// success; on partial failure (one fetch errors) we keep the previous
/// snapshot intact and log. Callers should treat this as best-effort.
pub async fn refresh_registries(instance: &Arc<InstanceCtx>) -> Result<(), AppError> {
    use std::collections::HashMap;

    use crate::state::DeviceMeta;

    let (base_url, access_token, verify_tls) = {
        let cfg = instance.config.read().await;
        (cfg.base_url.clone(), cfg.access_token.clone(), cfg.verify_tls)
    };

    let devices = fetch_device_registry(&base_url, &access_token, verify_tls).await?;
    let entities = fetch_entity_registry(&base_url, &access_token, verify_tls).await?;

    let empty = Vec::new();
    let device_arr = devices.as_array().unwrap_or(&empty);
    let mut device_map: HashMap<String, DeviceMeta> = HashMap::with_capacity(device_arr.len());
    for d in device_arr {
        let Some(device_id) = d.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let str_field = |k: &str| {
            d.get(k)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
        };
        let name = str_field("name_by_user").or_else(|| str_field("name"));
        device_map.insert(
            device_id.to_string(),
            DeviceMeta {
                manufacturer: str_field("manufacturer"),
                model: str_field("model"),
                sw_version: str_field("sw_version"),
                serial_number: str_field("serial_number"),
                name,
            },
        );
    }

    let entity_arr = entities.as_array().unwrap_or(&empty);
    let mut e2d_map: HashMap<String, String> = HashMap::with_capacity(entity_arr.len());
    for e in entity_arr {
        let Some(entity_id) = e.get("entity_id").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Some(device_id) = e.get("device_id").and_then(|v| v.as_str())
            && !device_id.is_empty()
        {
            e2d_map.insert(entity_id.to_string(), device_id.to_string());
        }
    }

    let device_count = device_map.len();
    let entity_count = e2d_map.len();
    *instance.device_registry.write().await = Arc::new(device_map);
    *instance.entity_to_device.write().await = Arc::new(e2d_map);

    // TODO(P1.0-impl): Wire mark_default_hidden_for_diagnostic_entities here.
    //   Once `InstanceCtx` exposes the PgPool (or we thread it through), call:
    //
    //   let registry_entries: Vec<HaEntityRegistryEntry> = entity_arr
    //       .iter()
    //       .filter_map(HaEntityRegistryEntry::from_json)
    //       .collect();
    //   if let Err(e) = sync_visibility::mark_default_hidden_for_diagnostic_entities(
    //       &pool, instance.id, &registry_entries,
    //   ).await {
    //       warn!(err = %e, "failed to mark diagnostic entities as hidden");
    //   }
    //
    // Requires: `use crate::ha::sync_visibility::{self, HaEntityRegistryEntry};`

    debug!(
        instance_id = %instance.id,
        devices = device_count,
        entities_with_device = entity_count,
        "HA WS: registry caches refreshed"
    );
    Ok(())
}

/// Convert `http://host/...` → `ws://host/api/websocket` (strips any existing path).
fn to_ws_url(base_url: &str) -> anyhow::Result<String> {
    let trimmed = base_url.trim_end_matches('/');
    if let Some(rest) = trimmed.strip_prefix("https://") {
        Ok(format!("wss://{}/api/websocket", domain_of(rest)))
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        Ok(format!("ws://{}/api/websocket", domain_of(rest)))
    } else {
        anyhow::bail!("unsupported scheme in base_url: {base_url}")
    }
}

/// Extract `host[:port]` from the first path segment.
fn domain_of(s: &str) -> &str {
    s.split('/').next().unwrap_or(s)
}
