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
pub async fn run_connection(instance: Arc<InstanceCtx>) -> anyhow::Result<()> {
    // Build WS URL from base_url.
    let (base_url, access_token) = {
        let cfg = instance.config.read().await;
        (cfg.base_url.clone(), cfg.access_token.clone())
    };

    let ws_url = to_ws_url(&base_url)?;
    info!(instance_id = %instance.id, %ws_url, "HA WS: connecting");

    // Connect — tokio-tungstenite handles TLS via rustls-tls-webpki-roots.
    let (mut stream, _) = timeout(
        Duration::from_secs(15),
        connect_async_tls_with_config(&ws_url, None, false, None),
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
        let states: Vec<EntityState> = serde_json::from_value(result)
            .map_err(|e| anyhow::anyhow!("parse states: {e}"))?;
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
            json!({"id": id_subscribe, "type": "subscribe_events", "event_type": "state_changed"})
                .to_string(),
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

    // Update last_connected_at in DB (best-effort; pool is not available here
    // so caller's supervisor loop handles this after run_connection returns ok).

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

    let event_type = event_val
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if event_type != "state_changed" {
        return;
    }

    let data = event_val.get("data").cloned().unwrap_or(serde_json::Value::Null);
    match serde_json::from_value::<StateChangedData>(data) {
        Ok(changed) => {
            if let Some(new_state) = changed.new_state {
                instance
                    .store
                    .states
                    .insert(new_state.entity_id.clone(), new_state.clone());
                let _ = instance.store.tx.send(EntityEvent::Updated(Box::new(new_state)));
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
                let msg: WsMsg = serde_json::from_str(&text)
                    .map_err(|e| anyhow::anyhow!("WS parse: {e} — raw: {text}"))?;
                return Ok(msg);
            }
            Some(Ok(Message::Close(_))) => anyhow::bail!("WS closed"),
            Some(Ok(_)) => {} // skip binary / control frames
        }
    }
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
