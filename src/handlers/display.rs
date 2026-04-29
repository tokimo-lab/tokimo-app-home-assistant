//! Apple Home–style display attributes scoped per HA instance:
//! per-entity size/favorite/hidden/name/icon/area, plus batch reorder
//! endpoints for rooms and Favorites.
//!
//! Routes:
//!   PATCH /instances/:id/entities/:entity_id/display
//!   PATCH /instances/:id/rooms/reorder
//!   PATCH /instances/:id/favorites/reorder

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

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EntitySize {
    Small,
    Medium,
    Large,
}

impl EntitySize {
    fn as_db(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }

    fn from_db(s: &str) -> Result<Self, AppError> {
        match s {
            "small" => Ok(Self::Small),
            "medium" => Ok(Self::Medium),
            "large" => Ok(Self::Large),
            other => Err(AppError::internal(format!("invalid size in db: {other}"))),
        }
    }
}

/// Patch payload. Nullable fields use `Option<Option<T>>` so the client can
/// distinguish "absent" (don't change) from `null` (clear).
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct EntityDisplayUpdate {
    pub size: Option<EntitySize>,
    pub is_favorite: Option<bool>,
    pub favorite_order: Option<i32>,
    pub hidden: Option<bool>,
    pub sort_order: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_double_option_string")]
    pub display_name: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option_string")]
    pub custom_icon: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option_uuid")]
    pub area_id: Option<Option<Uuid>>,
    pub collapsed: Option<bool>,
    /// Only `Some(true)` is accepted. Setting `false` directly is rejected
    /// with 400 — clients must elect a new primary by PATCHing another
    /// entity in the same group with `group_primary=true`.
    pub group_primary: Option<bool>,
    /// Per-entity numeric precision. `Some(Some(n))` sets it (n=0/1/2),
    /// `Some(None)` clears it back to the frontend default, `None` leaves
    /// the column untouched. Validated to be in `0..=4`.
    #[serde(default, deserialize_with = "deserialize_double_option_i32")]
    pub decimal_places: Option<Option<i32>>,
}

fn deserialize_double_option_i32<'de, D>(deserializer: D) -> Result<Option<Option<i32>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<i32>::deserialize(deserializer).map(Some)
}

fn deserialize_double_option_string<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

fn deserialize_double_option_uuid<'de, D>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct EntityDisplayDto {
    pub instance_id: Uuid,
    pub entity_id: String,
    pub size: Option<EntitySize>,
    pub is_favorite: bool,
    pub favorite_order: i32,
    pub hidden: bool,
    pub sort_order: i32,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub area_id: Option<Uuid>,
    pub collapsed: bool,
    pub group_id: Option<String>,
    pub group_primary: bool,
    pub decimal_places: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoomReorderItem {
    pub room_id: Uuid,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FavoriteReorderItem {
    pub entity_id: String,
    pub favorite_order: i32,
}

#[derive(Debug, Serialize)]
pub struct ReorderResp {
    pub updated: usize,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn ensure_instance(pool: &sqlx::PgPool, id: Uuid) -> Result<(), AppError> {
    let exists: bool = sqlx::query("SELECT EXISTS(SELECT 1 FROM instances WHERE id = $1)")
        .bind(id)
        .fetch_one(pool)
        .await?
        .try_get(0)?;
    if !exists {
        return Err(AppError::not_found("instance not found"));
    }
    Ok(())
}

// ─── PATCH /instances/:id/entities/:entity_id/display ─────────────────────────

pub async fn update_display(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, entity_id)): Path<(Uuid, String)>,
    Json(req): Json<EntityDisplayUpdate>,
) -> Result<Json<EntityDisplayDto>, AppError> {
    // Reject group_primary=false: there is no well-defined "next primary"
    // for a group with no leader, and silently auto-electing one would
    // surprise the user. The only legal path to demote A is to promote B.
    if matches!(req.group_primary, Some(false)) {
        return Err(AppError::bad_request(
            "cannot set group_primary=false directly; \
             use PATCH on another entity with group_primary=true to elect a new primary",
        ));
    }

    // Validate decimal_places range when caller is setting a concrete value.
    if let Some(Some(n)) = req.decimal_places
        && !(0..=4).contains(&n)
    {
        return Err(AppError::bad_request("decimal_places must be in 0..=4"));
    }

    ensure_instance(&ctx.pool, instance_id).await?;

    // For nullable patch fields we pass (set_flag, value): when the flag is
    // false the column stays untouched on UPDATE; on INSERT it falls back to
    // the column default (NULL for these). For non-nullable fields we just
    // COALESCE the optional payload.
    let set_display_name = req.display_name.is_some();
    let display_name_value = req.display_name.unwrap_or(None);
    let set_custom_icon = req.custom_icon.is_some();
    let custom_icon_value = req.custom_icon.unwrap_or(None);
    let set_area_id = req.area_id.is_some();
    let area_id_value = req.area_id.unwrap_or(None);
    let set_decimal_places = req.decimal_places.is_some();
    let decimal_places_value = req.decimal_places.unwrap_or(None);
    let size_str = req.size.map(|s| s.as_db());

    // Wrap promote-then-upsert in a single transaction so a race between
    // "demote siblings" and "promote self" cannot leave the group with no
    // (or two) primaries.
    let mut tx = ctx.pool.begin().await?;

    // If the client is electing this entity as primary, demote every other
    // member of its group in one UPDATE. The subquery resolves the group_id
    // from the target row, so the caller doesn't have to know it. No-op
    // when the entity has group_id=NULL or no override row yet.
    let mut demoted_siblings: Vec<String> = Vec::new();
    if matches!(req.group_primary, Some(true)) {
        let rows = sqlx::query_scalar::<_, String>(
            "UPDATE entity_overrides
                SET group_primary = (entity_id = $2),
                    updated_at    = NOW()
              WHERE instance_id = $1
                AND group_id = (
                    SELECT group_id FROM entity_overrides
                     WHERE instance_id = $1 AND entity_id = $2
                )
                AND group_id IS NOT NULL
                AND entity_id <> $2
              RETURNING entity_id",
        )
        .bind(instance_id)
        .bind(&entity_id)
        .fetch_all(&mut *tx)
        .await?;
        demoted_siblings = rows;
    }

    let r = sqlx::query(
        r#"INSERT INTO entity_overrides (
                instance_id, entity_id,
                display_name, custom_icon, area_id,
                hidden, size, is_favorite, favorite_order, sort_order,
                collapsed, group_primary, decimal_places
           ) VALUES (
                $1, $2,
                $4, $6, $8,
                COALESCE($9, FALSE),
                $10,
                COALESCE($11, FALSE),
                COALESCE($12, 0),
                COALESCE($13, 0),
                COALESCE($14, FALSE),
                COALESCE($15, TRUE),
                CASE WHEN $16 THEN $17 ELSE NULL END
           )
           ON CONFLICT (instance_id, entity_id) DO UPDATE SET
                display_name   = CASE WHEN $3 THEN $4  ELSE entity_overrides.display_name END,
                custom_icon    = CASE WHEN $5 THEN $6  ELSE entity_overrides.custom_icon  END,
                area_id        = CASE WHEN $7 THEN $8  ELSE entity_overrides.area_id      END,
                hidden         = COALESCE($9,  entity_overrides.hidden),
                size           = COALESCE($10, entity_overrides.size),
                is_favorite    = COALESCE($11, entity_overrides.is_favorite),
                favorite_order = COALESCE($12, entity_overrides.favorite_order),
                sort_order     = COALESCE($13, entity_overrides.sort_order),
                collapsed      = COALESCE($14, entity_overrides.collapsed),
                group_primary  = COALESCE($15, entity_overrides.group_primary),
                decimal_places = CASE WHEN $16 THEN $17 ELSE entity_overrides.decimal_places END,
                updated_at     = NOW()
           RETURNING entity_id, display_name, custom_icon, area_id,
                     hidden, size, is_favorite, favorite_order, sort_order,
                     collapsed, group_id, group_primary, decimal_places"#,
    )
    .bind(instance_id)
    .bind(&entity_id)
    .bind(set_display_name)
    .bind(&display_name_value)
    .bind(set_custom_icon)
    .bind(&custom_icon_value)
    .bind(set_area_id)
    .bind(area_id_value)
    .bind(req.hidden)
    .bind(size_str)
    .bind(req.is_favorite)
    .bind(req.favorite_order)
    .bind(req.sort_order)
    .bind(req.collapsed)
    .bind(req.group_primary)
    .bind(set_decimal_places)
    .bind(decimal_places_value)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let size_db: Option<String> = r.get("size");
    let size_typed: Option<EntitySize> = size_db.as_deref().map(EntitySize::from_db).transpose()?;

    // Update cache after successful DB write.
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        let snapshot = crate::state::OverrideSnapshot {
            display_name: r.get("display_name"),
            custom_icon: r.get("custom_icon"),
            area_id: r.get("area_id"),
            hidden: r.get("hidden"),
            is_favorite: r.get("is_favorite"),
            favorite_order: r.get("favorite_order"),
            size: size_db.clone(),
            sort_order: r.get("sort_order"),
            collapsed: r.get("collapsed"),
            group_id: r.get("group_id"),
            group_primary: r.get("group_primary"),
            decimal_places: r.get("decimal_places"),
        };
        instance.override_cache.insert(entity_id.clone(), snapshot);

        // Refresh cache for any siblings we just demoted, and broadcast
        // EntityEvent::Updated for each so SSE clients see the role swap
        // immediately. We refetch the new override rows in one query to
        // keep the cache consistent without re-loading the whole instance.
        if !demoted_siblings.is_empty() {
            let sibling_rows = sqlx::query(&format!(
                "SELECT {cols} FROM entity_overrides \
                 WHERE instance_id = $1 AND entity_id = ANY($2)",
                cols = crate::handlers::entities::OVERRIDE_COLS,
            ))
            .bind(instance_id)
            .bind(&demoted_siblings)
            .fetch_all(&ctx.pool)
            .await?;

            for row in &sibling_rows {
                let ov = crate::handlers::entities::row_to_override(row);
                let snap = crate::handlers::entities::override_row_to_snapshot(&ov);
                instance.override_cache.insert(ov.entity_id.clone(), snap);
            }

            for sibling_id in &demoted_siblings {
                if let Some(state) = instance.store.states.get(sibling_id) {
                    let _ = instance.store.tx.send(crate::state::EntityEvent::Updated {
                        entity: Arc::new(state.clone()),
                        context_id: None,
                    });
                }
            }
        }
    }

    // Broadcast EntityEvent::Updated for the patched entity itself so SSE
    // clients see size/is_favorite/hidden/area_id/collapsed/group_primary
    // changes immediately, instead of waiting for the next upstream HA
    // state_changed. The SSE handler re-fetches the override row and merges
    // it into an EntityDto, so we only need to ship the current raw
    // EntityState here. If HA hasn't pushed this entity yet (no state in
    // the store), skip the broadcast — there's nothing to merge against,
    // and the next HA push will pick up the override anyway.
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id)
        && let Some(state) = instance.store.states.get(&entity_id)
    {
        let _ = instance.store.tx.send(crate::state::EntityEvent::Updated {
            entity: Arc::new(state.clone()),
            context_id: None,
        });
    }

    Ok(Json(EntityDisplayDto {
        instance_id,
        entity_id: r.get("entity_id"),
        size: size_typed,
        is_favorite: r.get("is_favorite"),
        favorite_order: r.get("favorite_order"),
        hidden: r.get("hidden"),
        sort_order: r.get("sort_order"),
        display_name: r.get("display_name"),
        custom_icon: r.get("custom_icon"),
        area_id: r.get("area_id"),
        collapsed: r.get("collapsed"),
        group_id: r.get("group_id"),
        group_primary: r.get("group_primary"),
        decimal_places: r.get("decimal_places"),
    }))
}

// ─── PATCH /instances/:id/rooms/reorder ───────────────────────────────────────

pub async fn reorder_rooms(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
    Json(items): Json<Vec<RoomReorderItem>>,
) -> Result<Json<ReorderResp>, AppError> {
    ensure_instance(&ctx.pool, instance_id).await?;
    if items.is_empty() {
        return Ok(Json(ReorderResp { updated: 0 }));
    }

    let ids: Vec<Uuid> = items.iter().map(|i| i.room_id).collect();
    let orders: Vec<i32> = items.iter().map(|i| i.sort_order).collect();

    // Verify every room belongs to this instance up-front, so we 404 cleanly
    // instead of silently no-op'ing on a foreign room_id.
    let owned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rooms WHERE instance_id = $1 AND id = ANY($2)")
        .bind(instance_id)
        .bind(&ids)
        .fetch_one(&ctx.pool)
        .await?;
    if (owned as usize) != items.len() {
        return Err(AppError::not_found("one or more rooms do not belong to this instance"));
    }

    let mut tx = ctx.pool.begin().await?;
    let res = sqlx::query(
        r#"UPDATE rooms
              SET sort_order = u.so, updated_at = NOW()
             FROM UNNEST($1::uuid[], $2::int[]) AS u(id, so)
            WHERE rooms.id = u.id
              AND rooms.instance_id = $3"#,
    )
    .bind(&ids)
    .bind(&orders)
    .bind(instance_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(ReorderResp {
        updated: res.rows_affected() as usize,
    }))
}

// ─── PATCH /instances/:id/favorites/reorder ───────────────────────────────────

pub async fn reorder_favorites(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
    Json(items): Json<Vec<FavoriteReorderItem>>,
) -> Result<Json<ReorderResp>, AppError> {
    ensure_instance(&ctx.pool, instance_id).await?;
    if items.is_empty() {
        return Ok(Json(ReorderResp { updated: 0 }));
    }

    let entity_ids: Vec<String> = items.iter().map(|i| i.entity_id.clone()).collect();
    let orders: Vec<i32> = items.iter().map(|i| i.favorite_order).collect();

    let mut tx = ctx.pool.begin().await?;
    // Upsert: if no override row yet, create one already pinned to Favorites
    // at the requested position. Existing rows only get favorite_order updated
    // (don't toggle is_favorite — reordering shouldn't pin/unpin).
    let res = sqlx::query(
        r#"INSERT INTO entity_overrides (instance_id, entity_id, is_favorite, favorite_order)
           SELECT $3, u.eid, TRUE, u.fo
             FROM UNNEST($1::text[], $2::int[]) AS u(eid, fo)
           ON CONFLICT (instance_id, entity_id) DO UPDATE SET
                favorite_order = EXCLUDED.favorite_order,
                updated_at     = NOW()"#,
    )
    .bind(&entity_ids)
    .bind(&orders)
    .bind(instance_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // Refresh cache after bulk update (easier than partial updates).
    if let Some(instance) = ctx.conn_pool.instances.get(&instance_id) {
        let _ = crate::handlers::entities::populate_override_cache(&ctx.pool, &instance, instance_id).await;
    }

    Ok(Json(ReorderResp {
        updated: res.rows_affected() as usize,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_size_serde_roundtrip_small() {
        let json = serde_json::to_string(&EntitySize::Small).unwrap();
        assert_eq!(json, "\"small\"");
        let back: EntitySize = serde_json::from_str(&json).unwrap();
        assert_eq!(back, EntitySize::Small);
    }

    #[test]
    fn entity_size_serde_roundtrip_medium() {
        let json = serde_json::to_string(&EntitySize::Medium).unwrap();
        assert_eq!(json, "\"medium\"");
        let back: EntitySize = serde_json::from_str(&json).unwrap();
        assert_eq!(back, EntitySize::Medium);
    }

    #[test]
    fn entity_size_serde_roundtrip_large() {
        let json = serde_json::to_string(&EntitySize::Large).unwrap();
        assert_eq!(json, "\"large\"");
        let back: EntitySize = serde_json::from_str(&json).unwrap();
        assert_eq!(back, EntitySize::Large);
    }

    #[test]
    fn entity_size_rejects_unknown() {
        let err = serde_json::from_str::<EntitySize>("\"huge\"").unwrap_err();
        assert!(err.to_string().to_lowercase().contains("variant"), "got: {err}");
    }

    #[test]
    fn entity_size_from_db_roundtrip() {
        for s in [EntitySize::Small, EntitySize::Medium, EntitySize::Large] {
            assert_eq!(
                EntitySize::from_db(s.as_db()).ok(),
                Some(s),
                "roundtrip failed for {s:?}"
            );
        }
    }

    #[test]
    fn entity_size_from_db_rejects_unknown() {
        assert!(EntitySize::from_db("huge").is_err());
    }

    #[test]
    fn display_update_omits_nullables_when_absent() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"size":"medium"}"#).unwrap();
        assert!(req.display_name.is_none(), "display_name absent → None");
        assert!(req.custom_icon.is_none(), "custom_icon absent → None");
        assert!(req.area_id.is_none(), "area_id absent → None");
        assert_eq!(req.size, Some(EntitySize::Medium));
    }

    #[test]
    fn display_update_distinguishes_null_display_name() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"display_name":null}"#).unwrap();
        assert_eq!(req.display_name, Some(None), "null → Some(None) (clear)");
    }

    #[test]
    fn display_update_accepts_display_name_value() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"display_name":"Living Room Lamp"}"#).unwrap();
        assert_eq!(req.display_name, Some(Some("Living Room Lamp".to_string())));
    }

    #[test]
    fn display_update_distinguishes_null_custom_icon() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"custom_icon":null}"#).unwrap();
        assert_eq!(req.custom_icon, Some(None));
    }

    #[test]
    fn display_update_accepts_area_id_value() {
        let id = Uuid::new_v4();
        let body = format!(r#"{{"area_id":"{id}"}}"#);
        let req: EntityDisplayUpdate = serde_json::from_str(&body).unwrap();
        assert_eq!(req.area_id, Some(Some(id)));
    }

    #[test]
    fn display_update_distinguishes_null_area_id() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"area_id":null}"#).unwrap();
        assert_eq!(req.area_id, Some(None));
    }

    #[test]
    fn display_update_accepts_sort_order() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"sort_order":42}"#).unwrap();
        assert_eq!(req.sort_order, Some(42));
    }

    #[test]
    fn display_update_accepts_collapsed() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"collapsed":true}"#).unwrap();
        assert_eq!(req.collapsed, Some(true));
    }

    #[test]
    fn display_update_accepts_group_primary_true() {
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"group_primary":true}"#).unwrap();
        assert_eq!(req.group_primary, Some(true));
    }

    #[test]
    fn display_update_parses_group_primary_false_for_handler_to_reject() {
        // The handler rejects this with 400; the type still needs to parse
        // it so we can produce a meaningful error message rather than a
        // generic "invalid request body" decode failure.
        let req: EntityDisplayUpdate = serde_json::from_str(r#"{"group_primary":false}"#).unwrap();
        assert_eq!(req.group_primary, Some(false));
    }
}
