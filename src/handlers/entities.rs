//! Entity listing and per-entity override handlers.

use std::sync::Arc;

use axum::{Json, extract::{Path, State}};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::EntityState;
use super::AppCtx;

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
    pub custom_name: Option<String>,
    pub custom_icon: Option<String>,
    pub hidden: bool,
    pub favourite: bool,
}

fn apply_override(state: EntityState, ov: Option<&OverrideRow>) -> EntityDto {
    EntityDto {
        entity_id: state.entity_id,
        state: state.state,
        attributes: state.attributes,
        last_changed: state.last_changed,
        last_updated: state.last_updated,
        context: state.context,
        custom_name: ov.and_then(|o| o.custom_name.clone()),
        custom_icon: ov.and_then(|o| o.custom_icon.clone()),
        hidden: ov.map(|o| o.hidden).unwrap_or(false),
        favourite: ov.map(|o| o.favourite).unwrap_or(false),
    }
}

struct OverrideRow {
    entity_id: String,
    custom_name: Option<String>,
    custom_icon: Option<String>,
    hidden: bool,
    favourite: bool,
}

async fn load_overrides(pool: &sqlx::PgPool) -> Result<Vec<OverrideRow>, AppError> {
    let rows = sqlx::query(
        "SELECT entity_id, custom_name, custom_icon, hidden, favourite FROM entity_overrides",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| OverrideRow {
            entity_id: r.get("entity_id"),
            custom_name: r.get("custom_name"),
            custom_icon: r.get("custom_icon"),
            hidden: r.get("hidden"),
            favourite: r.get("favourite"),
        })
        .collect())
}

// ─── List entities ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct EntitiesListResp {
    entities: Vec<EntityDto>,
}

pub async fn list(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<EntitiesListResp>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let overrides = load_overrides(&ctx.pool).await?;
    let ov_map: std::collections::HashMap<String, OverrideRow> =
        overrides.into_iter().map(|o| (o.entity_id.clone(), o)).collect();

    let entities = instance
        .store
        .states
        .iter()
        .map(|e| apply_override(e.value().clone(), ov_map.get(e.key())))
        .collect();

    Ok(Json(EntitiesListResp { entities }))
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

    let ov_row = sqlx::query(
        "SELECT entity_id, custom_name, custom_icon, hidden, favourite
         FROM entity_overrides WHERE entity_id = $1",
    )
    .bind(&entity_id)
    .fetch_optional(&ctx.pool)
    .await?;

    let ov = ov_row.map(|r| OverrideRow {
        entity_id: r.get("entity_id"),
        custom_name: r.get("custom_name"),
        custom_icon: r.get("custom_icon"),
        hidden: r.get("hidden"),
        favourite: r.get("favourite"),
    });

    Ok(Json(apply_override(state, ov.as_ref())))
}

// ─── Upsert override ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OverrideReq {
    pub custom_name: Option<String>,
    pub custom_icon: Option<String>,
    pub hidden: Option<bool>,
    pub favourite: Option<bool>,
}

#[derive(Serialize)]
pub struct OverrideResp {
    entity_id: String,
    custom_name: Option<String>,
    custom_icon: Option<String>,
    hidden: bool,
    favourite: bool,
    updated_at: DateTime<Utc>,
}

pub async fn upsert_override(
    State(ctx): State<Arc<AppCtx>>,
    Path((_id, entity_id)): Path<(Uuid, String)>,
    Json(req): Json<OverrideReq>,
) -> Result<Json<OverrideResp>, AppError> {
    let r = sqlx::query(
        r#"INSERT INTO entity_overrides(entity_id, custom_name, custom_icon, hidden, favourite)
           VALUES ($1, $2, $3, COALESCE($4, FALSE), COALESCE($5, FALSE))
           ON CONFLICT (entity_id) DO UPDATE SET
               custom_name  = COALESCE($2, entity_overrides.custom_name),
               custom_icon  = COALESCE($3, entity_overrides.custom_icon),
               hidden       = COALESCE($4, entity_overrides.hidden),
               favourite    = COALESCE($5, entity_overrides.favourite),
               updated_at   = NOW()
           RETURNING entity_id, custom_name, custom_icon, hidden, favourite, updated_at"#,
    )
    .bind(&entity_id)
    .bind(&req.custom_name)
    .bind(&req.custom_icon)
    .bind(req.hidden)
    .bind(req.favourite)
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(OverrideResp {
        entity_id: r.get("entity_id"),
        custom_name: r.get("custom_name"),
        custom_icon: r.get("custom_icon"),
        hidden: r.get("hidden"),
        favourite: r.get("favourite"),
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

    let mut domains: std::collections::HashMap<String, DomainCapabilities> =
        std::collections::HashMap::new();

    for entry in instance.store.states.iter() {
        let domain = entry
            .key().split('.')
            .next()
            .unwrap_or("unknown")
            .to_string();
        let cap = domains.entry(domain).or_insert(DomainCapabilities {
            count: 0,
            entity_ids: Vec::new(),
        });
        cap.count += 1;
        cap.entity_ids.push(entry.key().clone());
    }

    Ok(Json(CapabilitiesResp { domains }))
}
