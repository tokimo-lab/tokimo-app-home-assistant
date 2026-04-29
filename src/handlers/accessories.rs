//! Accessory member management: add / remove entities from an accessory,
//! with transactional primary re-election when needed.
//!
//! Routes:
//!   GET    /instances/:id/accessories/:group_id
//!   POST   /instances/:id/accessories/:group_id/members
//!   DELETE /instances/:id/accessories/:group_id/members/:entity_id
//!   POST   /instances/:id/accessories (optional, for creating manual groups)

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;
use crate::handlers::entities::OVERRIDE_COLS;

/// DTO for listing accessory members.
#[derive(Serialize)]
pub struct AccessoryMemberDto {
    pub entity_id: String,
    pub is_primary: bool,
    pub sub_function_role: Option<String>,
    /// Domain from live entity state. `None` when HA hasn't pushed the entity yet.
    pub domain: Option<String>,
    /// Friendly name from override or live state.
    pub friendly_name: Option<String>,
}

/// Payload for adding a member to an accessory.
#[derive(Deserialize)]
pub struct AddMemberRequest {
    pub entity_id: String,
}

/// GET /instances/:id/accessories/:group_id
///
/// List all entities in the given accessory, with primary flag and sub_function_role.
pub async fn list_members(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, group_id)): Path<(Uuid, String)>,
) -> Result<Json<Vec<AccessoryMemberDto>>, AppError> {
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

    let members: Vec<AccessoryMemberDto> = rows
        .iter()
        .map(|row| {
            let entity_id: String = row.get("entity_id");
            let group_primary: bool = row.get("group_primary");
            let sub_function_role: Option<String> = row.get("sub_function_role");

            // Try to get domain and friendly_name from live state
            let (domain, friendly_name) = instance
                .store
                .states
                .get(&entity_id)
                .map(|state| {
                    let domain = Some(state.entity_id.split('.').next().unwrap_or("").to_string());
                    let friendly_name = state
                        .attributes
                        .get("friendly_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    (domain, friendly_name)
                })
                .unwrap_or((None, None));

            AccessoryMemberDto {
                entity_id,
                is_primary: group_primary,
                sub_function_role,
                domain,
                friendly_name,
            }
        })
        .collect();

    Ok(Json(members))
}

/// POST /instances/:id/accessories/:group_id/members
///
/// Add an entity to an accessory. If the entity was previously the primary of
/// another accessory, re-elect a new primary in the old accessory.
pub async fn add_member(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, group_id)): Path<(Uuid, String)>,
    Json(req): Json<AddMemberRequest>,
) -> Result<Json<()>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&instance_id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    // Check if entity exists in HA state
    if !instance.store.states.contains_key(&req.entity_id) {
        return Err(AppError::not_found(format!(
            "entity {} not found in HA instance",
            req.entity_id
        )));
    }

    let mut tx = ctx.pool.begin().await?;

    // Fetch the entity's current group_id and group_primary status
    let old_group = sqlx::query(
        "SELECT group_id, group_primary FROM entity_overrides \
         WHERE instance_id = $1 AND entity_id = $2",
    )
    .bind(instance_id)
    .bind(&req.entity_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (old_group_id, was_primary): (Option<String>, bool) = old_group
        .map(|row| (row.get("group_id"), row.get("group_primary")))
        .unwrap_or((None, false));

    // Update the entity's group_id to the new accessory, and set group_primary=false
    // (the target accessory already has a primary; this entity joins as a sub-function)
    sqlx::query(
        "INSERT INTO entity_overrides (instance_id, entity_id, group_id, group_primary) \
         VALUES ($1, $2, $3, FALSE) \
         ON CONFLICT (instance_id, entity_id) DO UPDATE SET \
            group_id = $3, \
            group_primary = FALSE, \
            updated_at = NOW()",
    )
    .bind(instance_id)
    .bind(&req.entity_id)
    .bind(&group_id)
    .execute(&mut *tx)
    .await?;

    // If the entity was the primary of its old accessory, re-elect a new primary there
    if was_primary
        && old_group_id.is_some()
        && old_group_id.as_deref() != Some(&group_id)
        && let Some(old_gid) = old_group_id
    {
        re_elect_primary_in_group(&mut tx, instance_id, &old_gid, &instance).await?;
    }

    tx.commit().await?;

    // Invalidate cache
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        instance.override_cache.remove(&req.entity_id);
        // Broadcast entity updated event
        if let Some(state) = instance.store.states.get(&req.entity_id) {
            let _ = instance.store.tx.send(crate::state::EntityEvent::Updated {
                entity: Arc::new(state.clone()),
                context_id: None,
            });
        }
    }

    Ok(Json(()))
}

/// DELETE /instances/:id/accessories/:group_id/members/:entity_id
///
/// Remove an entity from an accessory (set group_id=NULL, group_primary=true,
/// sub_function_role=NULL). If the entity was the primary and the accessory
/// still has other members, re-elect a new primary.
pub async fn remove_member(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, group_id, entity_id)): Path<(Uuid, String, String)>,
) -> Result<Json<()>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&instance_id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let mut tx = ctx.pool.begin().await?;

    // Fetch the entity's group_primary status
    let was_primary = sqlx::query_scalar::<_, bool>(
        "SELECT group_primary FROM entity_overrides \
         WHERE instance_id = $1 AND entity_id = $2 AND group_id = $3",
    )
    .bind(instance_id)
    .bind(&entity_id)
    .bind(&group_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(false);

    // Remove the entity from the accessory
    sqlx::query(
        "UPDATE entity_overrides \
         SET group_id = NULL, \
             group_primary = TRUE, \
             sub_function_role = NULL, \
             updated_at = NOW() \
         WHERE instance_id = $1 AND entity_id = $2",
    )
    .bind(instance_id)
    .bind(&entity_id)
    .execute(&mut *tx)
    .await?;

    // If the entity was the primary and the accessory still has members, re-elect
    let remaining_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM entity_overrides \
         WHERE instance_id = $1 AND group_id = $2",
    )
    .bind(instance_id)
    .bind(&group_id)
    .fetch_one(&mut *tx)
    .await?;

    if was_primary && remaining_count > 0 {
        re_elect_primary_in_group(&mut tx, instance_id, &group_id, &instance).await?;
    }

    tx.commit().await?;

    // Invalidate cache
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        instance.override_cache.remove(&entity_id);
        // Broadcast entity updated event
        if let Some(state) = instance.store.states.get(&entity_id) {
            let _ = instance.store.tx.send(crate::state::EntityEvent::Updated {
                entity: Arc::new(state.clone()),
                context_id: None,
            });
        }
    }

    Ok(Json(()))
}

/// Helper: re-elect a primary in a group after the old primary left or was demoted.
/// Uses the same primary selection rules as sync_visibility.rs.
async fn re_elect_primary_in_group(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    instance_id: Uuid,
    group_id: &str,
    instance: &crate::state::InstanceCtx,
) -> Result<(), AppError> {
    // Fetch all entities in the group
    let members = sqlx::query(
        "SELECT entity_id FROM entity_overrides \
         WHERE instance_id = $1 AND group_id = $2",
    )
    .bind(instance_id)
    .bind(group_id)
    .fetch_all(&mut **tx)
    .await?;

    if members.is_empty() {
        return Ok(());
    }

    // Build sort keys for each member using live HA state
    let mut candidates: Vec<(String, (u8, i64, usize, String))> = Vec::new();
    for row in &members {
        let entity_id: String = row.get("entity_id");
        if let Some(state) = instance.store.states.get(&entity_id) {
            let domain = state.entity_id.split('.').next().unwrap_or("").to_string();
            let supported_features = state
                .attributes
                .get("supported_features")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let friendly_name = state
                .attributes
                .get("friendly_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let sort_key = crate::ha::sync_visibility::primary_sort_key(
                &domain,
                supported_features,
                friendly_name.as_deref(),
                &entity_id,
            );
            candidates.push((
                entity_id.clone(),
                (sort_key.0, sort_key.1, sort_key.2, sort_key.3.to_string()),
            ));
        }
    }

    if candidates.is_empty() {
        // No live state for any member; pick the first entity_id alphabetically
        let entity_id: String = members[0].get("entity_id");
        sqlx::query(
            "UPDATE entity_overrides \
             SET group_primary = (entity_id = $2), \
                 updated_at = NOW() \
             WHERE instance_id = $1 AND group_id = $3",
        )
        .bind(instance_id)
        .bind(&entity_id)
        .bind(group_id)
        .execute(&mut **tx)
        .await?;
        return Ok(());
    }

    // Sort and pick the first (lowest sort key = highest priority)
    candidates.sort_by(|a, b| a.1.cmp(&b.1));
    let new_primary_id = &candidates[0].0;

    // Update all entities in the group: new_primary gets TRUE, others get FALSE
    sqlx::query(
        "UPDATE entity_overrides \
         SET group_primary = (entity_id = $2), \
             updated_at = NOW() \
         WHERE instance_id = $1 AND group_id = $3",
    )
    .bind(instance_id)
    .bind(new_primary_id)
    .bind(group_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
