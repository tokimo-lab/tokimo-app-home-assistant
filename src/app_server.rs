//! axum HTTP server on a Unix Domain Socket.
//!
//! Routes (proxied under `/api/apps/home-assistant/<rest>` by the central server):
//!
//! Control plane:
//!   GET    /instances
//!   POST   /instances
//!   GET    /instances/:id
//!   PATCH  /instances/:id
//!   DELETE /instances/:id
//!   POST   /instances/:id/test
//!   GET    /instances/:id/status
//!   GET    /instances/:id/entities
//!   GET    /instances/:id/entities/:entity_id
//!   POST   /instances/:id/entities/:entity_id/override
//!   POST   /instances/:id/services/:domain/:service
//!   GET    /instances/:id/areas
//!   GET    /instances/:id/rooms
//!   POST   /instances/:id/rooms
//!   POST   /instances/:id/rooms/sync_areas
//!   GET    /instances/:id/capabilities
//!
//! Room sub-resources (room_id is globally unique UUID):
//!   PATCH  /rooms/:room_id
//!   DELETE /rooms/:room_id
//!   POST   /rooms/:room_id/entities
//!   DELETE /rooms/:room_id/entities/:entity_id
//!
//! Data plane (SSE):
//!   GET    /data/instances/:id/events

use std::{path::PathBuf, sync::Arc};

use axum::{
    Router,
    routing::{delete, get, patch, post},
};
use tokimo_bus_protocol::DataPlaneSocket;
use tokio::net::UnixListener;
use tracing::{error, info};

use crate::{assets, handlers, handlers::AppCtx};

fn default_socket_path(service: &str) -> anyhow::Result<PathBuf> {
    let bus = std::env::var("TOKIMO_BUS_SOCKET")
        .map_err(|_| anyhow::anyhow!("TOKIMO_BUS_SOCKET not set"))?;
    let parent = PathBuf::from(&bus)
        .parent()
        .ok_or_else(|| anyhow::anyhow!("TOKIMO_BUS_SOCKET has no parent"))?
        .to_path_buf();
    let apps_dir = parent.join("apps");
    std::fs::create_dir_all(&apps_dir)?;
    Ok(apps_dir.join(format!("{service}.sock")))
}

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let path = default_socket_path(service)?;
    let _ = std::fs::remove_file(&path);
    let listener = UnixListener::bind(&path)?;
    info!(path = %path.display(), "home-assistant: app server listening");

    let router = build_router(ctx);
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            error!(error = %e, "home-assistant: app server stopped");
        }
    });

    Ok(DataPlaneSocket::Unix {
        path: path.to_string_lossy().into_owned(),
    })
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    use handlers::{entities, instances, rooms, services, sse};

    Router::new()
        // ── Instance CRUD ─────────────────────────────────────────────────
        .route(
            "/instances",
            get(instances::list).post(instances::create),
        )
        .route(
            "/instances/{id}",
            get(instances::get)
                .patch(instances::update)
                .delete(instances::delete),
        )
        .route("/instances/{id}/test", post(instances::test))
        .route("/instances/{id}/status", get(instances::status))
        // ── Entities ─────────────────────────────────────────────────────
        .route("/instances/{id}/entities", get(entities::list))
        .route("/instances/{id}/entities/{entity_id}", get(entities::get))
        .route(
            "/instances/{id}/entities/{entity_id}/override",
            post(entities::upsert_override),
        )
        .route("/instances/{id}/capabilities", get(entities::capabilities))
        // ── Services ─────────────────────────────────────────────────────
        .route(
            "/instances/{id}/services/{domain}/{service}",
            post(services::call_service),
        )
        // ── Areas ────────────────────────────────────────────────────────
        .route("/instances/{id}/areas", get(rooms::areas))
        // ── Rooms ────────────────────────────────────────────────────────
        .route(
            "/instances/{id}/rooms",
            get(rooms::list).post(rooms::create),
        )
        .route("/instances/{id}/rooms/sync_areas", post(rooms::sync_areas))
        .route(
            "/rooms/{room_id}",
            patch(rooms::update).delete(rooms::delete),
        )
        .route("/rooms/{room_id}/entities", post(rooms::add_entity))
        .route(
            "/rooms/{room_id}/entities/{entity_id}",
            delete(rooms::remove_entity),
        )
        // ── SSE data plane ───────────────────────────────────────────────
        .route("/data/instances/{id}/events", get(sse::events))
        // ── Static assets ────────────────────────────────────────────────
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
