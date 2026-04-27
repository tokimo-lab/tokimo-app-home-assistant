//! Apple Home–style display attributes: per-entity size/favorite/hidden/name,
//! plus batch reorder endpoints for rooms and Favorites.
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

/// Patch payload. `Option<Option<T>>` lets the client distinguish
/// "absent" (don't change) from `null` (clear).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EntityDisplayUpdate {
    pub size: Option<EntitySize>,
    pub is_favorite: Option<bool>,
    pub favorite_order: Option<i32>,
    pub hidden: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub display_name: Option<Option<String>>,
}

fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct EntityDisplayDto {
    pub instance_id: Uuid,
    pub entity_id: String,
    pub size: EntitySize,
    pub is_favorite: bool,
    pub favorite_order: i32,
    pub hidden: bool,
    pub display_name: Option<String>,
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
    ensure_instance(&ctx.pool, instance_id).await?;

    // display_name maps onto the existing custom_name column.
    // Patch semantics:
    //   - field absent  → leave column unchanged
    //   - field present → overwrite (incl. setting to NULL for display_name)
    let set_display_name = req.display_name.is_some();
    let display_name_value = req.display_name.unwrap_or(None);
    let size_str = req.size.map(|s| s.as_db());

    let r = sqlx::query(
        r#"INSERT INTO entity_overrides (
                entity_id, custom_name, hidden, size, is_favorite, favorite_order
           ) VALUES (
                $1,
                $3,
                COALESCE($4, FALSE),
                COALESCE($5, 'small'),
                COALESCE($6, FALSE),
                COALESCE($7, 0)
           )
           ON CONFLICT (entity_id) DO UPDATE SET
                custom_name    = CASE WHEN $2 THEN $3 ELSE entity_overrides.custom_name END,
                hidden         = COALESCE($4, entity_overrides.hidden),
                size           = COALESCE($5, entity_overrides.size),
                is_favorite    = COALESCE($6, entity_overrides.is_favorite),
                favorite_order = COALESCE($7, entity_overrides.favorite_order),
                updated_at     = NOW()
           RETURNING entity_id, custom_name, hidden, size, is_favorite, favorite_order"#,
    )
    .bind(&entity_id)
    .bind(set_display_name)
    .bind(&display_name_value)
    .bind(req.hidden)
    .bind(size_str)
    .bind(req.is_favorite)
    .bind(req.favorite_order)
    .fetch_one(&ctx.pool)
    .await?;

    let size_db: String = r.get("size");
    Ok(Json(EntityDisplayDto {
        instance_id,
        entity_id: r.get("entity_id"),
        size: EntitySize::from_db(&size_db)?,
        is_favorite: r.get("is_favorite"),
        favorite_order: r.get("favorite_order"),
        hidden: r.get("hidden"),
        display_name: r.get("custom_name"),
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
    let owned: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rooms WHERE instance_id = $1 AND id = ANY($2)",
    )
    .bind(instance_id)
    .bind(&ids)
    .fetch_one(&ctx.pool)
    .await?;
    if (owned as usize) != items.len() {
        return Err(AppError::not_found(
            "one or more rooms do not belong to this instance",
        ));
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
        r#"INSERT INTO entity_overrides (entity_id, is_favorite, favorite_order)
           SELECT u.eid, TRUE, u.fo
             FROM UNNEST($1::text[], $2::int[]) AS u(eid, fo)
           ON CONFLICT (entity_id) DO UPDATE SET
                favorite_order = EXCLUDED.favorite_order,
                updated_at     = NOW()"#,
    )
    .bind(&entity_ids)
    .bind(&orders)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(ReorderResp {
        updated: res.rows_affected() as usize,
    }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

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
        assert!(
            err.to_string().to_lowercase().contains("variant"),
            "got: {err}"
        );
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
    fn display_update_omits_display_name_when_absent() {
        let req: EntityDisplayUpdate =
            serde_json::from_str(r#"{"size":"medium"}"#).unwrap();
        assert!(req.display_name.is_none(), "absent → None");
        assert_eq!(req.size, Some(EntitySize::Medium));
    }

    #[test]
    fn display_update_distinguishes_null_display_name() {
        let req: EntityDisplayUpdate =
            serde_json::from_str(r#"{"display_name":null}"#).unwrap();
        assert_eq!(req.display_name, Some(None), "null → Some(None) (clear)");
    }

    #[test]
    fn display_update_accepts_display_name_value() {
        let req: EntityDisplayUpdate =
            serde_json::from_str(r#"{"display_name":"Living Room Lamp"}"#).unwrap();
        assert_eq!(
            req.display_name,
            Some(Some("Living Room Lamp".to_string()))
        );
    }
}
