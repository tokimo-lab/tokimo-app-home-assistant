//! Room management handlers (local rooms + sync from HA area registry).

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct RoomDto {
    pub id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub accent: Option<String>,
    pub sort_order: i32,
    pub ha_area_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub entities: Vec<RoomEntityDto>,
}

#[derive(Serialize)]
pub struct RoomEntityDto {
    pub entity_id: String,
    pub sort_order: i32,
}

async fn load_rooms(pool: &sqlx::PgPool, instance_id: Uuid) -> Result<Vec<RoomDto>, AppError> {
    let rows = sqlx::query(
        "SELECT r.id, r.name, r.icon, r.accent, r.sort_order, r.ha_area_id, r.created_at, r.updated_at,
                re.entity_id, re.sort_order AS entity_sort_order
         FROM rooms r
         LEFT JOIN room_entities re ON re.room_id = r.id
         WHERE r.instance_id = $1
         ORDER BY r.sort_order, r.created_at, re.sort_order",
    )
    .bind(instance_id)
    .fetch_all(pool)
    .await?;

    let mut rooms: Vec<RoomDto> = Vec::new();
    for r in rows {
        let room_id: Uuid = r.get("id");
        if rooms.last().map(|rm: &RoomDto| rm.id) != Some(room_id) {
            rooms.push(RoomDto {
                id: room_id,
                name: r.get("name"),
                icon: r.get("icon"),
                accent: r.get("accent"),
                sort_order: r.get("sort_order"),
                ha_area_id: r.get("ha_area_id"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
                entities: Vec::new(),
            });
        }
        let entity_id: Option<String> = r.get("entity_id");
        if let Some(eid) = entity_id
            && let Some(room) = rooms.last_mut()
        {
            room.entities.push(RoomEntityDto {
                entity_id: eid,
                sort_order: r.get("entity_sort_order"),
            });
        }
    }
    Ok(rooms)
}

// ─── List rooms ───────────────────────────────────────────────────────────────

pub async fn list(State(ctx): State<Arc<AppCtx>>, Path(id): Path<Uuid>) -> Result<Json<Vec<RoomDto>>, AppError> {
    let rooms = load_rooms(&ctx.pool, id).await?;
    Ok(Json(rooms))
}

// ─── Create room ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateRoomReq {
    pub name: String,
    pub icon: Option<String>,
    pub accent: Option<String>,
    pub sort_order: Option<i32>,
}

pub async fn create(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Json(req): Json<CreateRoomReq>,
) -> Result<Json<RoomDto>, AppError> {
    if req.name.trim().is_empty() {
        return Err(AppError::bad_request("name is required"));
    }
    let sort_order = req.sort_order.unwrap_or(0);
    let r = sqlx::query(
        "INSERT INTO rooms(instance_id, name, icon, accent, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, icon, accent, sort_order, ha_area_id, created_at, updated_at",
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.icon)
    .bind(&req.accent)
    .bind(sort_order)
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(RoomDto {
        id: r.get("id"),
        name: r.get("name"),
        icon: r.get("icon"),
        accent: r.get("accent"),
        sort_order: r.get("sort_order"),
        ha_area_id: r.get("ha_area_id"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        entities: Vec::new(),
    }))
}

// ─── Update room ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdateRoomReq {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub accent: Option<String>,
    pub sort_order: Option<i32>,
}

pub async fn update(
    State(ctx): State<Arc<AppCtx>>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<UpdateRoomReq>,
) -> Result<Json<RoomDto>, AppError> {
    let r = sqlx::query(
        "UPDATE rooms SET
             name       = COALESCE($2, name),
             icon       = COALESCE($3, icon),
             accent     = COALESCE($4, accent),
             sort_order = COALESCE($5, sort_order),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, icon, accent, sort_order, ha_area_id, created_at, updated_at",
    )
    .bind(room_id)
    .bind(&req.name)
    .bind(&req.icon)
    .bind(&req.accent)
    .bind(req.sort_order)
    .fetch_one(&ctx.pool)
    .await?;

    let entities =
        sqlx::query("SELECT entity_id, sort_order FROM room_entities WHERE room_id = $1 ORDER BY sort_order")
            .bind(room_id)
            .fetch_all(&ctx.pool)
            .await?
            .into_iter()
            .map(|e| RoomEntityDto {
                entity_id: e.get("entity_id"),
                sort_order: e.get("sort_order"),
            })
            .collect();

    Ok(Json(RoomDto {
        id: r.get("id"),
        name: r.get("name"),
        icon: r.get("icon"),
        accent: r.get("accent"),
        sort_order: r.get("sort_order"),
        ha_area_id: r.get("ha_area_id"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        entities,
    }))
}

// ─── Delete room ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DeleteResp {
    deleted: bool,
}

pub async fn delete(State(ctx): State<Arc<AppCtx>>, Path(room_id): Path<Uuid>) -> Result<Json<DeleteResp>, AppError> {
    let res = sqlx::query("DELETE FROM rooms WHERE id = $1")
        .bind(room_id)
        .execute(&ctx.pool)
        .await?;
    Ok(Json(DeleteResp {
        deleted: res.rows_affected() > 0,
    }))
}

// ─── Room entity membership ───────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AddEntityReq {
    pub entity_id: String,
    pub sort_order: Option<i32>,
}

#[derive(Serialize)]
pub struct AddEntityResp {
    room_id: Uuid,
    entity_id: String,
    sort_order: i32,
}

pub async fn add_entity(
    State(ctx): State<Arc<AppCtx>>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<AddEntityReq>,
) -> Result<Json<AddEntityResp>, AppError> {
    let sort_order = req.sort_order.unwrap_or(0);
    sqlx::query(
        "INSERT INTO room_entities(room_id, entity_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, entity_id) DO UPDATE SET sort_order = EXCLUDED.sort_order",
    )
    .bind(room_id)
    .bind(&req.entity_id)
    .bind(sort_order)
    .execute(&ctx.pool)
    .await?;

    Ok(Json(AddEntityResp {
        room_id,
        entity_id: req.entity_id,
        sort_order,
    }))
}

pub async fn remove_entity(
    State(ctx): State<Arc<AppCtx>>,
    Path((room_id, entity_id)): Path<(Uuid, String)>,
) -> Result<Json<DeleteResp>, AppError> {
    let res = sqlx::query("DELETE FROM room_entities WHERE room_id = $1 AND entity_id = $2")
        .bind(room_id)
        .bind(&entity_id)
        .execute(&ctx.pool)
        .await?;
    Ok(Json(DeleteResp {
        deleted: res.rows_affected() > 0,
    }))
}

// ─── Sync areas from HA ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SyncAreasResp {
    upserted: usize,
    upserted_entities: usize,
}

pub async fn sync_areas(State(ctx): State<Arc<AppCtx>>, Path(id): Path<Uuid>) -> Result<Json<SyncAreasResp>, AppError> {
    let r = sqlx::query("SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1")
        .bind(id)
        .fetch_one(&ctx.pool)
        .await?;
    let base_url: String = r.get("base_url");
    let access_token: String = r.get("access_token");
    let verify_tls: bool = r.get("verify_tls");

    let areas = crate::ha::ws::fetch_area_registry(&base_url, &access_token, verify_tls).await?;
    let entities = crate::ha::ws::fetch_entity_registry(&base_url, &access_token, verify_tls).await?;
    let devices = crate::ha::ws::fetch_device_registry(&base_url, &access_token, verify_tls).await?;

    let arr = areas
        .as_array()
        .ok_or_else(|| AppError::bad_gateway("area registry response is not an array"))?;

    let mut upserted = 0usize;
    for area in arr {
        let ha_area_id = area.get("area_id").and_then(|v| v.as_str()).unwrap_or_default();
        let name = area.get("name").and_then(|v| v.as_str()).unwrap_or(ha_area_id);
        if ha_area_id.is_empty() {
            continue;
        }
        sqlx::query(
            r#"INSERT INTO rooms(instance_id, name, ha_area_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (instance_id, ha_area_id)
               DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()"#,
        )
        .bind(id)
        .bind(name)
        .bind(ha_area_id)
        .execute(&ctx.pool)
        .await?;
        upserted += 1;
    }

    // Build ha_area_id -> room.id (uuid) map for this instance.
    let room_rows = sqlx::query("SELECT id, ha_area_id FROM rooms WHERE instance_id = $1 AND ha_area_id IS NOT NULL")
        .bind(id)
        .fetch_all(&ctx.pool)
        .await?;
    let mut area_to_room: std::collections::HashMap<String, Uuid> = std::collections::HashMap::new();
    for row in room_rows {
        let room_id: Uuid = row.get("id");
        let ha_area_id: String = row.get("ha_area_id");
        area_to_room.insert(ha_area_id, room_id);
    }

    // Build device_id -> ha_area_id map.
    let empty_vec = Vec::new();
    let device_arr = devices.as_array().unwrap_or(&empty_vec);
    let mut device_area: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for d in device_arr {
        let Some(did) = d.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Some(aid) = d.get("area_id").and_then(|v| v.as_str()) {
            device_area.insert(did.to_string(), aid.to_string());
        }
    }

    // For each entity compute effective area and upsert into entity_overrides.
    let entity_arr = entities.as_array().unwrap_or(&empty_vec);
    let mut upserted_entities = 0usize;
    for e in entity_arr {
        let Some(entity_id) = e.get("entity_id").and_then(|v| v.as_str()) else {
            continue;
        };
        if entity_id.is_empty() {
            continue;
        }
        let effective_area_ha: Option<String> = e
            .get("area_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                e.get("device_id")
                    .and_then(|v| v.as_str())
                    .and_then(|did| device_area.get(did).cloned())
            });
        let Some(ha_aid) = effective_area_ha else {
            continue;
        };
        let Some(room_uuid) = area_to_room.get(&ha_aid).copied() else {
            continue;
        };

        sqlx::query(
            r#"INSERT INTO entity_overrides(instance_id, entity_id, area_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (instance_id, entity_id)
               DO UPDATE SET area_id = EXCLUDED.area_id, updated_at = NOW()"#,
        )
        .bind(id)
        .bind(entity_id)
        .bind(room_uuid)
        .execute(&ctx.pool)
        .await?;
        upserted_entities += 1;
    }

    // Refresh cache after bulk area updates.
    if let Some(instance) = ctx.conn_pool.instances.get(&id) {
        let _ = crate::handlers::entities::populate_override_cache(&ctx.pool, &instance, id).await;
    }

    Ok(Json(SyncAreasResp {
        upserted,
        upserted_entities,
    }))
}

// ─── Areas passthrough ────────────────────────────────────────────────────────

pub async fn areas(State(ctx): State<Arc<AppCtx>>, Path(id): Path<Uuid>) -> Result<Json<serde_json::Value>, AppError> {
    let r = sqlx::query("SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1")
        .bind(id)
        .fetch_one(&ctx.pool)
        .await?;
    let base_url: String = r.get("base_url");
    let access_token: String = r.get("access_token");
    let verify_tls: bool = r.get("verify_tls");

    let result = crate::ha::ws::fetch_area_registry(&base_url, &access_token, verify_tls).await?;
    Ok(Json(result))
}
