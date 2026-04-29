//! Entity listing and per-entity override handlers.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
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
    pub size: Option<String>,
    pub sort_order: i32,
    pub collapsed: bool,
    pub group_id: Option<String>,
    pub group_primary: bool,
    /// Device metadata (manufacturer / model / sw_version / serial_number /
    /// name) sourced from HA's device registry. Only populated by the
    /// per-entity `GET /entities/:eid` endpoint — list endpoints leave this
    /// `None` to keep the snapshot payload small. `None` when the entity
    /// has no associated device or the registry cache is not ready.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<crate::state::DeviceMeta>,
}

pub(crate) fn apply_override(state: EntityState, ov: Option<&OverrideRow>) -> EntityDto {
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
        size: ov.and_then(|o| o.size.clone()),
        sort_order: ov.map(|o| o.sort_order).unwrap_or(0),
        collapsed: ov.map(|o| o.collapsed).unwrap_or(false),
        group_id: ov.and_then(|o| o.group_id.clone()),
        group_primary: ov.map(|o| o.group_primary).unwrap_or(true),
        device: None,
    }
}

/// Apply overrides from cached snapshot (avoids per-event DB query).
pub(crate) fn apply_override_snapshot(state: EntityState, ov: Option<&crate::state::OverrideSnapshot>) -> EntityDto {
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
        size: ov.and_then(|o| o.size.clone()),
        sort_order: ov.map(|o| o.sort_order).unwrap_or(0),
        collapsed: ov.map(|o| o.collapsed).unwrap_or(false),
        group_id: ov.and_then(|o| o.group_id.clone()),
        group_primary: ov.map(|o| o.group_primary).unwrap_or(true),
        device: None,
    }
}

/// Convert OverrideRow to OverrideSnapshot (helper for cache population).
pub(crate) fn override_row_to_snapshot(o: &OverrideRow) -> crate::state::OverrideSnapshot {
    crate::state::OverrideSnapshot {
        display_name: o.display_name.clone(),
        custom_icon: o.custom_icon.clone(),
        area_id: o.area_id,
        hidden: o.hidden,
        is_favorite: o.is_favorite,
        favorite_order: o.favorite_order,
        size: o.size.clone(),
        sort_order: o.sort_order,
        collapsed: o.collapsed,
        group_id: o.group_id.clone(),
        group_primary: o.group_primary,
    }
}

pub(crate) struct OverrideRow {
    pub entity_id: String,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub area_id: Option<Uuid>,
    pub hidden: bool,
    pub is_favorite: bool,
    pub favorite_order: i32,
    pub size: Option<String>,
    pub sort_order: i32,
    pub collapsed: bool,
    pub group_id: Option<String>,
    pub group_primary: bool,
}

pub(crate) const OVERRIDE_COLS: &str = "entity_id, display_name, custom_icon, area_id, hidden, is_favorite, favorite_order, size, sort_order, collapsed, group_id, group_primary";

pub(crate) fn row_to_override(r: &sqlx::postgres::PgRow) -> OverrideRow {
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
        collapsed: r.get("collapsed"),
        group_id: r.get("group_id"),
        group_primary: r.get("group_primary"),
    }
}

pub(crate) async fn load_overrides(pool: &sqlx::PgPool, instance_id: Uuid) -> Result<Vec<OverrideRow>, AppError> {
    let rows = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides WHERE instance_id = $1"
    ))
    .bind(instance_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(row_to_override).collect())
}

/// Populate the override cache for an instance from the DB.
/// Clears the cache first, then loads all overrides.
pub(crate) async fn populate_override_cache(
    pool: &sqlx::PgPool,
    instance: &Arc<crate::state::InstanceCtx>,
    instance_id: Uuid,
) -> Result<(), AppError> {
    let overrides = load_overrides(pool, instance_id).await?;
    instance.override_cache.clear();
    for o in overrides {
        let snapshot = override_row_to_snapshot(&o);
        instance.override_cache.insert(o.entity_id.clone(), snapshot);
    }
    Ok(())
}

// ─── List entities ────────────────────────────────────────────────────────────

/// Query params for `GET /instances/:id/entities`.
///
/// `include_hidden` defaults to `false`: hidden entities (entries with
/// `entity_overrides.hidden = true`) are stripped from the response. UI
/// surfaces that need the full set (e.g. an entity-management page) must
/// pass `?include_hidden=true` explicitly.
#[derive(Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct ListParams {
    #[serde(default)]
    pub include_hidden: bool,
}

/// Build a fresh snapshot of all entities for an instance with overrides
/// merged in. Shared by GET `/entities` and the SSE handler so both paths
/// emit identical `EntityDto` shapes.
pub(crate) async fn snapshot_entities(
    pool: &sqlx::PgPool,
    instance: &Arc<crate::state::InstanceCtx>,
    instance_id: Uuid,
) -> Result<Vec<EntityDto>, AppError> {
    let overrides = load_overrides(pool, instance_id).await?;
    let ov_map: std::collections::HashMap<String, OverrideRow> =
        overrides.into_iter().map(|o| (o.entity_id.clone(), o)).collect();

    Ok(instance
        .store
        .states
        .iter()
        .map(|e| apply_override(e.value().clone(), ov_map.get(e.key())))
        .collect())
}

/// Build a snapshot using the cached overrides (SSE hot path optimization).
pub(crate) fn snapshot_entities_cached(instance: &Arc<crate::state::InstanceCtx>) -> Vec<EntityDto> {
    instance
        .store
        .states
        .iter()
        .map(|e| {
            let ov = instance.override_cache.get(e.key()).map(|r| r.clone());
            apply_override_snapshot(e.value().clone(), ov.as_ref())
        })
        .collect()
}

/// Fetch a single override row by entity_id (used by SSE per-entity updates).
pub(crate) async fn fetch_override(
    pool: &sqlx::PgPool,
    instance_id: Uuid,
    entity_id: &str,
) -> Result<Option<OverrideRow>, AppError> {
    let row = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides WHERE instance_id = $1 AND entity_id = $2"
    ))
    .bind(instance_id)
    .bind(entity_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.as_ref().map(row_to_override))
}

pub async fn list(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<EntityDto>>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let mut entities = snapshot_entities(&ctx.pool, &instance, id).await?;
    if !params.include_hidden {
        entities.retain(|e| !e.hidden);
    }
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

    let ov = fetch_override(&ctx.pool, id, &entity_id).await?;
    let device = instance.device_for_entity(&entity_id).await;

    let mut dto = apply_override(state, ov.as_ref());
    dto.device = device;
    Ok(Json(dto))
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
           RETURNING entity_id, display_name, custom_icon, hidden, is_favorite, updated_at,
                     area_id, favorite_order, size, sort_order,
                     collapsed, group_id, group_primary"#,
    )
    .bind(instance_id)
    .bind(&entity_id)
    .bind(&req.display_name)
    .bind(&req.custom_icon)
    .bind(req.hidden)
    .bind(req.is_favorite)
    .fetch_one(&ctx.pool)
    .await?;

    // Update cache after successful DB write.
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        let snapshot = crate::state::OverrideSnapshot {
            display_name: r.get("display_name"),
            custom_icon: r.get("custom_icon"),
            area_id: r.get("area_id"),
            hidden: r.get("hidden"),
            is_favorite: r.get("is_favorite"),
            favorite_order: r.get("favorite_order"),
            size: r.get("size"),
            sort_order: r.get("sort_order"),
            collapsed: r.get("collapsed"),
            group_id: r.get("group_id"),
            group_primary: r.get("group_primary"),
        };
        instance.override_cache.insert(entity_id.clone(), snapshot);
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_params_default_excludes_hidden() {
        let q = ListParams::default();
        assert!(!q.include_hidden);
    }

    #[test]
    fn list_params_parse_include_hidden_true() {
        let q: ListParams = serde_json::from_str(r#"{"include_hidden":true}"#).unwrap();
        assert!(q.include_hidden);
    }

    #[test]
    fn list_params_parse_omitted_defaults_false() {
        let q: ListParams = serde_json::from_str("{}").unwrap();
        assert!(!q.include_hidden);
    }
}
