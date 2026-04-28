//! SSE data-plane handler — streams entity events to browser clients.
//!
//! On connect: immediately emits a `snapshot` with the full current entity
//! store. Then forwards broadcast events as `updated` / `removed` / `status`.
//! On `RecvError::Lagged` a `resync` event is emitted followed by a fresh
//! snapshot to re-synchronize the client.

use std::sync::Arc;
use std::time::Duration;

use async_stream::stream;
use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::Stream;
use uuid::Uuid;

use super::AppCtx;
use super::entities::{apply_override_snapshot, snapshot_entities, snapshot_entities_cached};
use crate::error::AppError;
use crate::state::EntityEvent;

pub async fn events(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    // Subscribe before snapshotting to avoid a race.
    let mut rx = instance.store.tx.subscribe();

    // If the WS supervisor hasn't yet bootstrapped (still connecting, or in
    // backoff), the store is empty and the client would render an empty
    // dashboard until HA pushes the next state_changed event. Seed once via
    // HA REST so the first snapshot is usable. Failures are logged and
    // ignored — the SSE stream still works, and the WS supervisor will fill
    // the store as soon as it connects.
    if instance.store.states.is_empty() {
        let (base_url, access_token) = {
            let cfg = instance.config.read().await;
            (cfg.base_url.clone(), cfg.access_token.clone())
        };
        match crate::ha::rest::get_states(&instance.http, &base_url, &access_token).await {
            Ok(states) => {
                for s in states {
                    instance.store.states.insert(s.entity_id.clone(), s);
                }
                tracing::debug!(
                    instance_id = %id,
                    count = instance.store.states.len(),
                    "SSE: seeded entity store from HA REST"
                );
            }
            Err(e) => {
                tracing::warn!(
                    instance_id = %id,
                    error = %e.message,
                    "SSE: failed to seed entity store from HA REST; continuing with empty snapshot"
                );
            }
        }
    }

    // Build initial snapshot with overrides merged so the client receives a
    // single consistent `EntityDto` shape (area_id/is_favorite/size/...).
    let snapshot = snapshot_entities(&ctx.pool, &instance, id).await?;
    let instance_for_stream = instance.clone();

    let s = stream! {
        // Initial snapshot.
        let snap_json = serde_json::json!({
            "type": "snapshot",
            "entities": snapshot,
        });
        yield Ok(Event::default().data(snap_json.to_string()));

        loop {
            match rx.recv().await {
                Ok(event) => {
                    let data = match &event {
                        EntityEvent::Snapshot(_states) => {
                            // Re-merge overrides for the broadcast snapshot
                            // (e.g. on WS reconnect). Use cached overrides for hot path.
                            let merged = snapshot_entities_cached(&instance_for_stream);
                            serde_json::json!({
                                "type": "snapshot",
                                "entities": merged,
                            })
                        }
                        EntityEvent::Updated { entity, context_id } => {
                            // Read override from cache (no DB query).
                            let ov = instance_for_stream
                                .override_cache
                                .get(&entity.entity_id)
                                .map(|r| r.clone());
                            let dto = apply_override_snapshot((**entity).clone(), ov.as_ref());
                            serde_json::json!({
                                "type": "updated",
                                "entity": dto,
                                "context_id": context_id,
                            })
                        }
                        EntityEvent::Removed(entity_id) => serde_json::json!({
                            "type": "removed",
                            "entity_id": entity_id,
                        }),
                        EntityEvent::Status(status) => serde_json::json!({
                            "type": "status",
                            "status": status,
                        }),
                    };
                    yield Ok(Event::default().data(data.to_string()));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // Client fell behind — send resync then fresh snapshot.
                    yield Ok(Event::default().data(r#"{"type":"resync"}"#));

                    let fresh = snapshot_entities_cached(&instance_for_stream);
                    let snap = serde_json::json!({
                        "type": "snapshot",
                        "entities": fresh,
                    });
                    yield Ok(Event::default().data(snap.to_string()));
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    // Channel dropped (instance removed).
                    break;
                }
            }
        }
    };

    Ok(Sse::new(s).keep_alive(KeepAlive::default().interval(Duration::from_secs(10))))
}
