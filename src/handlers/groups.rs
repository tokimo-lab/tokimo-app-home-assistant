//! Accessory-group entity listing.
//!
//! Routes:
//!   GET /accessories/:gid/entities
//!
//! Returns every `EntityDto` belonging to the given accessory group,
//! regardless of `hidden` / `collapsed`. Backed by `accessory_group_members`
//! joined to `entity_overrides`.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;
use crate::handlers::entities::{EntityDto, OVERRIDE_COLS, apply_override, group_ids_for, row_to_override};

pub async fn list_by_group(
    State(ctx): State<Arc<AppCtx>>,
    Path(group_id): Path<Uuid>,
) -> Result<Json<Vec<EntityDto>>, AppError> {
    let instance_id: Uuid = sqlx::query_scalar("SELECT instance_id FROM accessory_groups WHERE id = $1")
        .bind(group_id)
        .fetch_optional(&ctx.pool)
        .await?
        .ok_or_else(|| AppError::not_found("accessory group not found"))?;

    let instance = ctx
        .conn_pool
        .instances
        .get(&instance_id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    // Fetch member entity_ids in stable order, then SELECT their overrides.
    let member_ids: Vec<String> = sqlx::query_scalar(
        "SELECT entity_id FROM accessory_group_members \
          WHERE group_id = $1 \
          ORDER BY sort_order ASC, entity_id ASC",
    )
    .bind(group_id)
    .fetch_all(&ctx.pool)
    .await?;

    if member_ids.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let rows = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides \
          WHERE instance_id = $1 AND entity_id = ANY($2)"
    ))
    .bind(instance_id)
    .bind(&member_ids)
    .fetch_all(&ctx.pool)
    .await?;
    let ov_map: std::collections::HashMap<String, _> = rows
        .iter()
        .map(|r| {
            let ov = row_to_override(r);
            (ov.entity_id.clone(), ov)
        })
        .collect();

    let dtos: Vec<EntityDto> = member_ids
        .iter()
        .filter_map(|eid| {
            instance.store.states.get(eid).map(|s| {
                let gids = group_ids_for(&instance, eid);
                apply_override(s.clone(), ov_map.get(eid), gids)
            })
        })
        .collect();

    Ok(Json(dtos))
}
