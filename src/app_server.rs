//! axum HTTP server on a cross-platform bus data-plane socket.
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
//!   POST   /instances/:id/rescan
//!   GET    /instances/:id/status
//!   GET    /instances/:id/summary
//!   GET    /instances/:id/entities
//!   GET    /instances/:id/entities/:entity_id
//!   POST   /instances/:id/entities/:entity_id/override
//!   POST   /instances/:id/services/:domain/:service
//!   GET    /instances/:id/areas
//!   GET    /instances/:id/rooms
//!   POST   /instances/:id/rooms
//!   POST   /instances/:id/rooms/sync_areas
//!   GET    /instances/:id/capabilities
//!   GET    /instances/:id/camera_proxy/:entity_id
//!
//! Room sub-resources (room_id is globally unique UUID):
//!   PATCH  /rooms/:room_id
//!   DELETE /rooms/:room_id
//!   POST   /rooms/:room_id/entities
//!   DELETE /rooms/:room_id/entities/:entity_id
//!
//! Accessory tile creation (per-instance natural_key namespace):
//!   GET    /instances/:id/accessories
//!   POST   /instances/:id/accessories
//!
//! Accessory tile sub-resources (gid is globally unique UUID):
//!   GET    /accessories/:gid/entities
//!   GET    /accessories/:gid/members
//!   POST   /accessories/:gid/members
//!   PATCH  /accessories/:gid/members/:entity_id
//!   DELETE /accessories/:gid/members/:entity_id
//!   DELETE /accessories/:gid                       (delete entire tile, any source)
//!
//! Data plane (SSE):
//!   GET    /instances/:id/events

use std::sync::Arc;

use axum::{
    Router,
    routing::{delete, get, patch, post},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tracing::{error, info};

use crate::{assets, handlers, handlers::AppCtx};

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let (listener, socket) = BusListener::bind_for_app(service)?;
    info!(?socket, "home-assistant: app server listening");

    let router = build_router(ctx);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            error!(error = %e, "home-assistant: app server stopped");
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    use handlers::{accessories, camera, display, entities, groups, instances, rooms, services, sse, summary};

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
        .route("/instances/{id}/rescan", post(instances::rescan))
        .route("/instances/{id}/status", get(instances::status))
        .route("/instances/{id}/summary", get(summary::get_summary))
        // ── Entities ─────────────────────────────────────────────────────
        .route("/instances/{id}/entities", get(entities::list))
        .route("/instances/{id}/entities/{entity_id}", get(entities::get))
        // ── Accessories (M:N tile membership) ────────────────────────────
        .route(
            "/instances/{id}/accessories",
            get(accessories::list_groups).post(accessories::create_manual_group),
        )
        .route("/accessories/{gid}/entities", get(groups::list_by_group))
        .route(
            "/accessories/{gid}",
            delete(accessories::delete_group),
        )
        .route(
            "/accessories/{gid}/members",
            get(accessories::list_members).post(accessories::add_member),
        )
        .route(
            "/accessories/{gid}/members/{entity_id}",
            patch(accessories::update_member).delete(accessories::remove_member),
        )
        // ─────────────────────────────────────────────────────────────────
        .route(
            "/instances/{id}/entities/{entity_id}/override",
            post(entities::upsert_override),
        )
        .route("/instances/{id}/capabilities", get(entities::capabilities))
        // ── Camera proxy ─────────────────────────────────────────────────
        .route(
            "/instances/{instance_id}/camera_proxy/{entity_id}",
            get(camera::camera_proxy),
        )
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
