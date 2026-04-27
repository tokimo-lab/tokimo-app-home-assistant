//! Entity listing and per-entity override handlers.

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
use crate::state::EntityState;

// ─── Entity DTO (state + optional override) ───────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct EntityDto {
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
    pub last_changed: String,
    pub last_updated: String,
    pub context: Option<serde_json::Value>,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub area_id: Option<Uuid>,
    pub hidden: bool,
    pub is_favorite: bool,
    pub favorite_order: i32,
    pub size: String,
    pub sort_order: i32,
}

fn apply_override(state: EntityState, ov: Option<&OverrideRow>) -> EntityDto {
    EntityDto {
        entity_id: state.entity_id,
        state: state.state,
        attributes: state.attributes,
        last_changed: state.last_changed,
        last_updated: state.last_updated,
        context: state.context,
        display_name: ov.and_then(|o| o.display_name.clone()),
        custom_icon: ov.and_then(|o| o.custom_icon.clone()),
        area_id: ov.and_then(|o| o.area_id),
        hidden: ov.map(|o| o.hidden).unwrap_or(false),
        is_favorite: ov.map(|o| o.is_favorite).unwrap_or(false),
        favorite_order: ov.map(|o| o.favorite_order).unwrap_or(0),
        size: ov.map(|o| o.size.clone()).unwrap_or_else(|| "small".to_string()),
        sort_order: ov.map(|o| o.sort_order).unwrap_or(0),
    }
}

struct OverrideRow {
    entity_id: String,
    display_name: Option<String>,
    custom_icon: Option<String>,
    area_id: Option<Uuid>,
    hidden: bool,
    is_favorite: bool,
    favorite_order: i32,
    size: String,
    sort_order: i32,
}

const OVERRIDE_COLS: &str =
    "entity_id, display_name, custom_icon, area_id, hidden, is_favorite, favorite_order, size, sort_order";

fn row_to_override(r: &sqlx::postgres::PgRow) -> OverrideRow {
    OverrideRow {
        entity_id: r.get("entity_id"),
        display_name: r.get("display_name"),
        custom_icon: r.get("custom_icon"),
        area_id: r.get("area_id"),
        hidden: r.get("hidden"),
        is_favorite: r.get("is_favorite"),
        favorite_order: r.get("favorite_order"),
        size: r.get("size"),
        sort_order: r.get("sort_order"),
    }
}

async fn load_overrides(pool: &sqlx::PgPool, instance_id: Uuid) -> Result<Vec<OverrideRow>, AppError> {
    let rows = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides WHERE instance_id = $1"
    ))
    .bind(instance_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(row_to_override).collect())
}

// ─── List entities ────────────────────────────────────────────────────────────

pub async fn list(State(ctx): State<Arc<AppCtx>>, Path(id): Path<Uuid>) -> Result<Json<Vec<EntityDto>>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let overrides = load_overrides(&ctx.pool, id).await?;
    let ov_map: std::collections::HashMap<String, OverrideRow> =
        overrides.into_iter().map(|o| (o.entity_id.clone(), o)).collect();

    let entities: Vec<EntityDto> = instance
        .store
        .states
        .iter()
        .map(|e| apply_override(e.value().clone(), ov_map.get(e.key())))
        .collect();

    Ok(Json(entities))
}

// ─── Get single entity ────────────────────────────────────────────────────────

pub async fn get(
    State(ctx): State<Arc<AppCtx>>,
    Path((id, entity_id)): Path<(Uuid, String)>,
) -> Result<Json<EntityDto>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let state = instance
        .store
        .states
        .get(&entity_id)
        .ok_or_else(|| AppError::not_found("entity not found"))?
        .clone();

    let ov_row = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides WHERE instance_id = $1 AND entity_id = $2"
    ))
    .bind(id)
    .bind(&entity_id)
    .fetch_optional(&ctx.pool)
    .await?;

    let ov = ov_row.as_ref().map(row_to_override);

    Ok(Json(apply_override(state, ov.as_ref())))
}

// ─── Upsert override ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OverrideReq {
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub hidden: Option<bool>,
    pub is_favorite: Option<bool>,
}

#[derive(Serialize)]
pub struct OverrideResp {
    entity_id: String,
    display_name: Option<String>,
    custom_icon: Option<String>,
    hidden: bool,
    is_favorite: bool,
    updated_at: DateTime<Utc>,
}

pub async fn upsert_override(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, entity_id)): Path<(Uuid, String)>,
    Json(req): Json<OverrideReq>,
) -> Result<Json<OverrideResp>, AppError> {
    let r = sqlx::query(
        r#"INSERT INTO entity_overrides(instance_id, entity_id, display_name, custom_icon, hidden, is_favorite)
           VALUES ($1, $2, $3, $4, COALESCE($5, FALSE), COALESCE($6, FALSE))
           ON CONFLICT (instance_id, entity_id) DO UPDATE SET
               display_name = COALESCE($3, entity_overrides.display_name),
               custom_icon  = COALESCE($4, entity_overrides.custom_icon),
               hidden       = COALESCE($5, entity_overrides.hidden),
               is_favorite  = COALESCE($6, entity_overrides.is_favorite),
               updated_at   = NOW()
           RETURNING entity_id, display_name, custom_icon, hidden, is_favorite, updated_at"#,
    )
    .bind(instance_id)
    .bind(&entity_id)
    .bind(&req.display_name)
    .bind(&req.custom_icon)
    .bind(req.hidden)
    .bind(req.is_favorite)
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(OverrideResp {
        entity_id: r.get("entity_id"),
        display_name: r.get("display_name"),
        custom_icon: r.get("custom_icon"),
        hidden: r.get("hidden"),
        is_favorite: r.get("is_favorite"),
        updated_at: r.get("updated_at"),
    }))
}

// ─── Capabilities summary ─────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CapabilitiesResp {
    /// Map from HA domain (e.g. "light", "switch") to feature summary.
    domains: std::collections::HashMap<String, DomainCapabilities>,
}

#[derive(Serialize)]
pub struct DomainCapabilities {
    count: usize,
    entity_ids: Vec<String>,
}

pub async fn capabilities(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<CapabilitiesResp>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let mut domains: std::collections::HashMap<String, DomainCapabilities> = std::collections::HashMap::new();

    for entry in instance.store.states.iter() {
        let domain = entry.key().split('.').next().unwrap_or("unknown").to_string();
        let cap = domains.entry(domain).or_insert(DomainCapabilities {
            count: 0,
            entity_ids: Vec::new(),
        });
        cap.count += 1;
        cap.entity_ids.push(entry.key().clone());
    }

    Ok(Json(CapabilitiesResp { domains }))
}
