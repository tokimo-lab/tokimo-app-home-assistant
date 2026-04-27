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
//!   GET    /instances/:id/events

#[cfg(unix)]
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    Router,
    routing::{delete, get, patch, post},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tower::Service;
use tracing::{error, info};

use crate::{assets, handlers, handlers::AppCtx};

#[cfg(unix)]
fn default_socket_path(service: &str) -> anyhow::Result<PathBuf> {
    let bus = std::env::var("TOKIMO_BUS_SOCKET").map_err(|_| anyhow::anyhow!("TOKIMO_BUS_SOCKET not set"))?;
    let parent = PathBuf::from(&bus)
        .parent()
        .ok_or_else(|| anyhow::anyhow!("TOKIMO_BUS_SOCKET has no parent"))?
        .to_path_buf();
    let apps_dir = parent.join("apps");
    std::fs::create_dir_all(&apps_dir)?;
    Ok(apps_dir.join(format!("{service}.sock")))
}

#[cfg(windows)]
fn default_pipe_name(service: &str) -> String {
    format!("tokimo-app-{}-{}", service, std::process::id())
}

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    #[cfg(unix)]
    let socket = {
        let path = default_socket_path(service)?;
        let _ = std::fs::remove_file(&path);
        DataPlaneSocket::Unix {
            path: path.to_string_lossy().into_owned(),
        }
    };

    #[cfg(windows)]
    let socket = DataPlaneSocket::NamedPipe {
        name: default_pipe_name(service),
    };

    let mut listener = BusListener::bind(&socket)?;
    info!(?socket, "home-assistant: app server listening");

    let app = build_router(ctx).into_make_service();
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok(stream) => {
                    let mut tower_service = app.clone();
                    tokio::spawn(async move {
                        let io = hyper_util::rt::TokioIo::new(stream);
                        match tower_service.call(&()).await {
                            Ok(service) => {
                                let hyper_service = hyper_util::service::TowerToHyperService::new(service);
                                if let Err(e) = hyper::server::conn::http1::Builder::new()
                                    .serve_connection(io, hyper_service)
                                    .await
                                {
                                    error!(error = %e, "home-assistant: connection error");
                                }
                            }
                            Err(e) => {
                                error!(error = ?e, "home-assistant: service creation failed");
                            }
                        }
                    });
                }
                Err(e) => {
                    error!(error = %e, "home-assistant: accept failed");
                }
            }
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    use handlers::{display, entities, instances, rooms, services, sse};

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
        // ── Display / favorites / room order ─────────────────────────────
        .route(
            "/instances/{id}/entities/{entity_id}/display",
            patch(display::update_display),
        )
        .route(
            "/instances/{id}/rooms/reorder",
            patch(display::reorder_rooms),
        )
        .route(
            "/instances/{id}/favorites/reorder",
            patch(display::reorder_favorites),
        )
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
        .route("/instances/{id}/events", get(sse::events))
        // ── Static assets ────────────────────────────────────────────────
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
