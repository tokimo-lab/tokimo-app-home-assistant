//! Group-scoped entity listing.
//!
//! Routes:
//!   GET /instances/:id/entities/groups/:group_id
//!
//! Returns every `EntityDto` in the group regardless of `hidden`,
//! `collapsed`, or `group_primary` — UI surfaces that need to render the
//! "show all members of this group" expansion can fetch the full set in
//! one call. Backed by the partial index
//! `entity_overrides_group_idx (instance_id, group_id) WHERE group_id IS NOT NULL`.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;
use crate::handlers::entities::{
    EntityDto, OVERRIDE_COLS, apply_override, row_to_override,
};

pub async fn list_by_group(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, group_id)): Path<(Uuid, String)>,
) -> Result<Json<Vec<EntityDto>>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&instance_id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let rows = sqlx::query(&format!(
        "SELECT {OVERRIDE_COLS} FROM entity_overrides \
         WHERE instance_id = $1 AND group_id = $2"
    ))
    .bind(instance_id)
    .bind(&group_id)
    .fetch_all(&ctx.pool)
    .await?;

    // Join with in-memory state. Override rows whose entity hasn't been
    // pushed by HA yet are skipped — there's no live state to merge against.
    // Empty group (no override rows) returns []; we don't 404 because
    // group_id is a user-derivable string, not a database resource id.
    let dtos: Vec<EntityDto> = rows
        .iter()
        .map(row_to_override)
        .filter_map(|ov| {
            instance
                .store
                .states
                .get(&ov.entity_id)
                .map(|s| apply_override(s.clone(), Some(&ov)))
        })
        .collect();

    Ok(Json(dtos))
}
