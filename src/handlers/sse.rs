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

    // Build initial snapshot.
    let snapshot: Vec<crate::state::EntityState> = instance.store.states.iter().map(|e| e.value().clone()).collect();

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
                        EntityEvent::Snapshot(states) => serde_json::json!({
                            "type": "snapshot",
                            "entities": states,
                        }),
                        EntityEvent::Updated { entity, context_id } => serde_json::json!({
                            "type": "updated",
                            "entity": entity,
                            "context_id": context_id,
                        }),
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

                    let fresh: Vec<crate::state::EntityState> = instance
                        .store
                        .states
                        .iter()
                        .map(|e| e.value().clone())
                        .collect();
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
