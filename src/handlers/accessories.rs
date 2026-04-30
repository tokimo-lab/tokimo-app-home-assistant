//! Accessory (tile) member management — M:N entity ↔ tile relationship.
//!
//! Routes:
//!   GET    /instances/:id/accessories           (list all groups for instance)
//!   GET    /accessories/:gid/members
//!   POST   /accessories/:gid/members             (append entity to tile)
//!   PATCH  /accessories/:gid/members/:entity_id  (toggle is_primary / sub_function_role / sort_order)
//!   DELETE /accessories/:gid/members/:entity_id
//!   POST   /instances/:id/accessories            (manually create a tile)
//!
//! Ownership semantics:
//! - `accessory_groups.source = 'auto'` rows are owned by sync_visibility and
//!   may be created/destroyed at any time. `'manual'` rows are user-owned and
//!   never auto-removed. `remove_member` only cascades-delete an *auto* group
//!   when its last member leaves; a manual group may legitimately be empty.
//! - `add_member` is *append* (an entity may live in many tiles), not move.
//!   This deliberately differs from the old 1:1 schema where re-tagging a
//!   primary required tearing down its previous group.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;
use crate::state::{AccessoryGroup, AccessoryGroupMember, InstanceCtx};

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AccessoryMemberDto {
    pub entity_id: String,
    pub is_primary: bool,
    pub sub_function_role: Option<String>,
    pub sort_order: i32,
    /// Domain from live entity state. `None` when HA hasn't pushed the entity yet.
    pub domain: Option<String>,
    /// Friendly name from live state.
    pub friendly_name: Option<String>,
}

#[derive(Deserialize)]
pub struct AddMemberRequest {
    pub entity_id: String,
    /// Optional: claim primary on add. Defaults to `false`. Auto-promoted to
    /// `true` when this is the first member (otherwise the tile would render
    /// with no leader).
    #[serde(default)]
    pub is_primary: bool,
    #[serde(default)]
    pub sub_function_role: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

#[derive(Deserialize, Default)]
pub struct PatchMemberRequest {
    /// Only `Some(true)` is honored — see `update_member` for the rationale
    /// behind the asymmetry.
    pub is_primary: Option<bool>,
    /// `Some(Some(role))` sets it, `Some(None)` clears it, `None` leaves untouched.
    #[serde(default, deserialize_with = "deserialize_double_option_string")]
    pub sub_function_role: Option<Option<String>>,
    pub sort_order: Option<i32>,
}

fn deserialize_double_option_string<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Deserialize)]
pub struct CreateGroupRequest {
    /// Required for manual groups so they are addressable + idempotent on
    /// retry. The handler enforces uniqueness via the
    /// `accessory_groups (instance_id, natural_key)` UNIQUE index.
    pub natural_key: String,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    /// Initial members — at least one entity, the first of which becomes the
    /// primary. May be expanded later via POST /members.
    #[serde(default)]
    pub member_entity_ids: Vec<String>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async fn fetch_group(pool: &sqlx::PgPool, gid: Uuid) -> Result<(Uuid, String), AppError> {
    let row = sqlx::query("SELECT instance_id, source FROM accessory_groups WHERE id = $1")
        .bind(gid)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::not_found("accessory group not found"))?;
    Ok((row.get("instance_id"), row.get("source")))
}

fn get_instance(ctx: &AppCtx, instance_id: Uuid) -> Result<Arc<InstanceCtx>, AppError> {
    Ok(ctx
        .conn_pool
        .instances
        .get(&instance_id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone())
}

async fn refresh_membership_cache(ctx: &AppCtx, instance_id: Uuid) -> Result<(), AppError> {
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        crate::handlers::entities::populate_group_membership_cache(&ctx.pool, instance.value(), instance_id).await?;
    }
    Ok(())
}

fn broadcast_entity(instance: &Arc<InstanceCtx>, entity_id: &str) {
    if let Some(state) = instance.store.states.get(entity_id) {
        let _ = instance.store.tx.send(crate::state::EntityEvent::Updated {
            entity: Arc::new(state.clone()),
            context_id: None,
        });
    }
}

// ─── GET /accessories/:gid/members ───────────────────────────────────────────

pub async fn list_members(
    State(ctx): State<Arc<AppCtx>>,
    Path(gid): Path<Uuid>,
) -> Result<Json<Vec<AccessoryMemberDto>>, AppError> {
    let (instance_id, _source) = fetch_group(&ctx.pool, gid).await?;
    let instance = get_instance(&ctx, instance_id)?;

    let rows = sqlx::query(
        "SELECT entity_id, is_primary, sub_function_role, sort_order \
           FROM accessory_group_members \
          WHERE group_id = $1 \
          ORDER BY sort_order ASC, entity_id ASC",
    )
    .bind(gid)
    .fetch_all(&ctx.pool)
    .await?;

    let members: Vec<AccessoryMemberDto> = rows
        .iter()
        .map(|row| {
            let entity_id: String = row.get("entity_id");
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
                is_primary: row.get("is_primary"),
                sub_function_role: row.get("sub_function_role"),
                sort_order: row.get("sort_order"),
                domain,
                friendly_name,
            }
        })
        .collect();

    Ok(Json(members))
}

// ─── POST /accessories/:gid/members (append, do NOT move) ────────────────────

pub async fn add_member(
    State(ctx): State<Arc<AppCtx>>,
    Path(gid): Path<Uuid>,
    Json(req): Json<AddMemberRequest>,
) -> Result<(StatusCode, Json<AccessoryMemberDto>), AppError> {
    let (instance_id, _source) = fetch_group(&ctx.pool, gid).await?;
    let instance = get_instance(&ctx, instance_id)?;

    if !instance.store.states.contains_key(&req.entity_id) {
        return Err(AppError::not_found(format!(
            "entity {} not found in HA instance",
            req.entity_id
        )));
    }

    let mut tx = ctx.pool.begin().await?;

    // Determine whether the tile already has any members; first-ever member
    // is auto-primary so the tile is renderable without a follow-up PATCH.
    let existing_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accessory_group_members WHERE group_id = $1")
        .bind(gid)
        .fetch_one(&mut *tx)
        .await?;

    let want_primary = req.is_primary || existing_count == 0;

    // Promoting to primary requires demoting any existing primary in the SAME
    // group first — the partial unique index would otherwise reject the
    // INSERT/UPDATE. We do this BEFORE writing self.
    if want_primary {
        sqlx::query(
            "UPDATE accessory_group_members \
                SET is_primary = FALSE \
              WHERE group_id = $1 AND entity_id <> $2",
        )
        .bind(gid)
        .bind(&req.entity_id)
        .execute(&mut *tx)
        .await?;
    }

    let next_sort_order = req.sort_order.unwrap_or((existing_count + 1) as i32);

    // INSERT ... ON CONFLICT — if entity is already a member of THIS tile,
    // the request just updates is_primary/sub_function_role/sort_order so
    // the call is idempotent.
    sqlx::query(
        "INSERT INTO accessory_group_members \
            (group_id, entity_id, instance_id, is_primary, sub_function_role, sort_order) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         ON CONFLICT (group_id, entity_id) DO UPDATE SET \
            is_primary = EXCLUDED.is_primary, \
            sub_function_role = EXCLUDED.sub_function_role, \
            sort_order = EXCLUDED.sort_order",
    )
    .bind(gid)
    .bind(&req.entity_id)
    .bind(instance_id)
    .bind(want_primary)
    .bind(&req.sub_function_role)
    .bind(next_sort_order)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    refresh_membership_cache(&ctx, instance_id).await?;
    broadcast_entity(&instance, &req.entity_id);

    Ok((
        StatusCode::CREATED,
        Json(AccessoryMemberDto {
            entity_id: req.entity_id.clone(),
            is_primary: want_primary,
            sub_function_role: req.sub_function_role,
            sort_order: next_sort_order,
            domain: instance
                .store
                .states
                .get(&req.entity_id)
                .map(|s| s.entity_id.split('.').next().unwrap_or("").to_string()),
            friendly_name: instance.store.states.get(&req.entity_id).and_then(|s| {
                s.attributes
                    .get("friendly_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }),
        }),
    ))
}

// ─── PATCH /accessories/:gid/members/:entity_id ─────────────────────────────

pub async fn update_member(
    State(ctx): State<Arc<AppCtx>>,
    Path((gid, entity_id)): Path<(Uuid, String)>,
    Json(req): Json<PatchMemberRequest>,
) -> Result<Json<AccessoryMemberDto>, AppError> {
    // Only `Some(true)` is allowed for is_primary. Setting it to false would
    // leave the tile leaderless; demote-by-promoting-someone-else is the
    // only legal path (matching the old display.rs invariant).
    if matches!(req.is_primary, Some(false)) {
        return Err(AppError::bad_request(
            "cannot set is_primary=false directly; \
             PATCH another member with is_primary=true to elect a new primary",
        ));
    }

    let (instance_id, _source) = fetch_group(&ctx.pool, gid).await?;
    let instance = get_instance(&ctx, instance_id)?;

    let mut tx = ctx.pool.begin().await?;

    // Verify membership exists.
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM accessory_group_members \
            WHERE group_id = $1 AND entity_id = $2)",
    )
    .bind(gid)
    .bind(&entity_id)
    .fetch_one(&mut *tx)
    .await?;
    if !exists {
        return Err(AppError::not_found("entity is not a member of this group"));
    }

    // Demote siblings if we're promoting (see add_member for rationale).
    if matches!(req.is_primary, Some(true)) {
        sqlx::query(
            "UPDATE accessory_group_members \
                SET is_primary = FALSE \
              WHERE group_id = $1 AND entity_id <> $2",
        )
        .bind(gid)
        .bind(&entity_id)
        .execute(&mut *tx)
        .await?;
    }

    let set_sub = req.sub_function_role.is_some();
    let sub_value = req.sub_function_role.unwrap_or(None);

    let row = sqlx::query(
        "UPDATE accessory_group_members SET \
            is_primary = COALESCE($3, is_primary), \
            sub_function_role = CASE WHEN $4 THEN $5 ELSE sub_function_role END, \
            sort_order = COALESCE($6, sort_order) \
          WHERE group_id = $1 AND entity_id = $2 \
        RETURNING entity_id, is_primary, sub_function_role, sort_order",
    )
    .bind(gid)
    .bind(&entity_id)
    .bind(req.is_primary)
    .bind(set_sub)
    .bind(&sub_value)
    .bind(req.sort_order)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    refresh_membership_cache(&ctx, instance_id).await?;
    broadcast_entity(&instance, &entity_id);

    Ok(Json(AccessoryMemberDto {
        entity_id: row.get("entity_id"),
        is_primary: row.get("is_primary"),
        sub_function_role: row.get("sub_function_role"),
        sort_order: row.get("sort_order"),
        domain: instance
            .store
            .states
            .get(&entity_id)
            .map(|s| s.entity_id.split('.').next().unwrap_or("").to_string()),
        friendly_name: instance.store.states.get(&entity_id).and_then(|s| {
            s.attributes
                .get("friendly_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        }),
    }))
}

// ─── DELETE /accessories/:gid/members/:entity_id ────────────────────────────

pub async fn remove_member(
    State(ctx): State<Arc<AppCtx>>,
    Path((gid, entity_id)): Path<(Uuid, String)>,
) -> Result<StatusCode, AppError> {
    let (instance_id, source) = fetch_group(&ctx.pool, gid).await?;
    let instance = get_instance(&ctx, instance_id)?;

    let mut tx = ctx.pool.begin().await?;

    let was_primary: Option<bool> = sqlx::query_scalar(
        "DELETE FROM accessory_group_members \
          WHERE group_id = $1 AND entity_id = $2 \
        RETURNING is_primary",
    )
    .bind(gid)
    .bind(&entity_id)
    .fetch_optional(&mut *tx)
    .await?;

    if was_primary.is_none() {
        return Err(AppError::not_found("entity is not a member of this group"));
    }

    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accessory_group_members WHERE group_id = $1")
        .bind(gid)
        .fetch_one(&mut *tx)
        .await?;

    if remaining == 0 {
        // Auto groups exist purely to hold sync-derived entities; an empty
        // auto group is meaningless and would just re-appear next sync.
        // Manual groups, by contrast, are user-defined containers — leaving
        // them empty is a valid intermediate state during reconfiguration.
        if source == "auto" {
            sqlx::query("DELETE FROM accessory_groups WHERE id = $1")
                .bind(gid)
                .execute(&mut *tx)
                .await?;
        }
    } else if was_primary == Some(true) {
        // Promote the lowest-sort_order remaining member to primary so the
        // tile keeps a well-defined leader. Tie-break on entity_id for
        // determinism.
        sqlx::query(
            "UPDATE accessory_group_members \
                SET is_primary = TRUE \
              WHERE (group_id, entity_id) = ( \
                  SELECT group_id, entity_id FROM accessory_group_members \
                   WHERE group_id = $1 \
                   ORDER BY sort_order ASC, entity_id ASC \
                   LIMIT 1 \
              )",
        )
        .bind(gid)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    refresh_membership_cache(&ctx, instance_id).await?;
    broadcast_entity(&instance, &entity_id);

    Ok(StatusCode::NO_CONTENT)
}

// ─── GET /instances/:id/accessories ──────────────────────────────────────────

/// List all accessory groups for a given instance, ordered by sort_order ASC.
/// Returns group metadata only (no members).
pub async fn list_groups(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
) -> Result<Json<Vec<AccessoryGroup>>, AppError> {
    // Verify instance exists.
    let _ = get_instance(&ctx, instance_id)?;

    let rows = sqlx::query(
        "SELECT id, instance_id, natural_key, display_name, custom_icon, source, sort_order \
           FROM accessory_groups \
          WHERE instance_id = $1 \
          ORDER BY sort_order ASC, natural_key ASC",
    )
    .bind(instance_id)
    .fetch_all(&ctx.pool)
    .await?;

    let groups: Vec<AccessoryGroup> = rows
        .iter()
        .map(|row| AccessoryGroup {
            id: row.get("id"),
            instance_id: row.get("instance_id"),
            natural_key: row.get("natural_key"),
            display_name: row.get("display_name"),
            custom_icon: row.get("custom_icon"),
            source: row.get("source"),
            sort_order: row.get("sort_order"),
        })
        .collect();

    Ok(Json(groups))
}

// ─── POST /instances/:id/accessories ─────────────────────────────────────────

#[derive(Serialize)]
pub struct CreateGroupResponse {
    pub group: AccessoryGroup,
    pub members: Vec<AccessoryGroupMember>,
}

pub async fn create_manual_group(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<(StatusCode, Json<CreateGroupResponse>), AppError> {
    if req.natural_key.trim().is_empty() {
        return Err(AppError::bad_request("natural_key must not be empty"));
    }

    let instance = get_instance(&ctx, instance_id)?;

    // Verify all initial member entity_ids exist in the live HA store, so a
    // typo at creation time fails loudly instead of producing a half-valid
    // tile.
    for eid in &req.member_entity_ids {
        if !instance.store.states.contains_key(eid) {
            return Err(AppError::not_found(format!("entity {eid} not found in HA instance")));
        }
    }

    let mut tx = ctx.pool.begin().await?;

    // INSERT the group. Conflict on (instance_id, natural_key) ⇒ 409 — manual
    // groups are user-namespaced so duplicates indicate a client bug.
    let group_row = sqlx::query(
        "INSERT INTO accessory_groups \
            (instance_id, natural_key, display_name, custom_icon, source) \
         VALUES ($1, $2, $3, $4, 'manual') \
         RETURNING id, instance_id, natural_key, display_name, custom_icon, source, sort_order",
    )
    .bind(instance_id)
    .bind(&req.natural_key)
    .bind(&req.display_name)
    .bind(&req.custom_icon)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::internal("INSERT RETURNING produced no row"))?;

    let group = AccessoryGroup {
        id: group_row.get("id"),
        instance_id: group_row.get("instance_id"),
        natural_key: group_row.get("natural_key"),
        display_name: group_row.get("display_name"),
        custom_icon: group_row.get("custom_icon"),
        source: group_row.get("source"),
        sort_order: group_row.get("sort_order"),
    };

    // Insert members. First member is primary; the rest are sub-functions.
    let mut members: Vec<AccessoryGroupMember> = Vec::new();
    for (idx, eid) in req.member_entity_ids.iter().enumerate() {
        let is_primary = idx == 0;
        sqlx::query(
            "INSERT INTO accessory_group_members \
                (group_id, entity_id, instance_id, is_primary, sub_function_role, sort_order) \
             VALUES ($1, $2, $3, $4, NULL, $5)",
        )
        .bind(group.id)
        .bind(eid)
        .bind(instance_id)
        .bind(is_primary)
        .bind(idx as i32)
        .execute(&mut *tx)
        .await?;
        members.push(AccessoryGroupMember {
            group_id: group.id,
            entity_id: eid.clone(),
            instance_id,
            is_primary,
            sub_function_role: None,
            sort_order: idx as i32,
        });
    }

    tx.commit().await?;

    refresh_membership_cache(&ctx, instance_id).await?;
    for m in &members {
        broadcast_entity(&instance, &m.entity_id);
    }

    Ok((StatusCode::CREATED, Json(CreateGroupResponse { group, members })))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_member_request_defaults() {
        let req: AddMemberRequest = serde_json::from_str(r#"{"entity_id":"light.kitchen"}"#).unwrap();
        assert_eq!(req.entity_id, "light.kitchen");
        assert!(!req.is_primary);
        assert!(req.sub_function_role.is_none());
        assert!(req.sort_order.is_none());
    }

    #[test]
    fn patch_member_request_distinguishes_null_role() {
        let req: PatchMemberRequest = serde_json::from_str(r#"{"sub_function_role":null}"#).unwrap();
        assert_eq!(req.sub_function_role, Some(None));
    }

    #[test]
    fn create_group_request_requires_natural_key() {
        let req: CreateGroupRequest =
            serde_json::from_str(r#"{"natural_key":"manual::abc","member_entity_ids":[]}"#).unwrap();
        assert_eq!(req.natural_key, "manual::abc");
        assert!(req.member_entity_ids.is_empty());
    }
}
