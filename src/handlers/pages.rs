//! Page + widget handlers.
//!
//! A "page" is one tab in the HA app's bottom navigation. Three system
//! kinds (`home`, `rooms`, `devices`) render built-in layouts and reject
//! widget mutations; `custom` pages are blank canvases the user fills
//! with widgets bound to HA entities.

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

// ─── Pages ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct PageDto {
    pub id: Uuid,
    pub instance_id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub kind: PageKind,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageKind {
    Home,
    Rooms,
    Devices,
    Custom,
}

impl PageKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Rooms => "rooms",
            Self::Devices => "devices",
            Self::Custom => "custom",
        }
    }

    fn parse(s: &str) -> Result<Self, AppError> {
        match s {
            "home" => Ok(Self::Home),
            "rooms" => Ok(Self::Rooms),
            "devices" => Ok(Self::Devices),
            "custom" => Ok(Self::Custom),
            other => Err(AppError::internal(format!("unknown page kind: {other}"))),
        }
    }
}

fn row_to_page(r: &sqlx::postgres::PgRow) -> Result<PageDto, AppError> {
    let kind: String = r.get("kind");
    Ok(PageDto {
        id: r.get("id"),
        instance_id: r.get("instance_id"),
        name: r.get("name"),
        icon: r.get("icon"),
        kind: PageKind::parse(&kind)?,
        sort_order: r.get("sort_order"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    })
}

pub async fn list(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
) -> Result<Json<Vec<PageDto>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, instance_id, name, icon, kind, sort_order, created_at, updated_at
         FROM pages
         WHERE instance_id = $1
         ORDER BY sort_order, created_at",
    )
    .bind(instance_id)
    .fetch_all(&ctx.pool)
    .await?;

    let pages = rows.iter().map(row_to_page).collect::<Result<Vec<_>, _>>()?;
    Ok(Json(pages))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreatePageReq {
    pub name: String,
    pub icon: Option<String>,
    pub kind: PageKind,
    pub sort_order: Option<i32>,
}

pub async fn create(
    State(ctx): State<Arc<AppCtx>>,
    Path(instance_id): Path<Uuid>,
    Json(req): Json<CreatePageReq>,
) -> Result<Json<PageDto>, AppError> {
    if req.name.trim().is_empty() {
        return Err(AppError::bad_request("name is required"));
    }

    // Verify instance exists; surfaces 404 instead of leaking an FK error.
    let exists: bool = sqlx::query("SELECT EXISTS(SELECT 1 FROM instances WHERE id = $1)")
        .bind(instance_id)
        .fetch_one(&ctx.pool)
        .await?
        .try_get(0)?;
    if !exists {
        return Err(AppError::not_found("instance not found"));
    }

    let r = sqlx::query(
        "INSERT INTO pages(instance_id, name, icon, kind, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, instance_id, name, icon, kind, sort_order, created_at, updated_at",
    )
    .bind(instance_id)
    .bind(&req.name)
    .bind(&req.icon)
    .bind(req.kind.as_str())
    .bind(req.sort_order.unwrap_or(0))
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(row_to_page(&r)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdatePageReq {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

pub async fn update(
    State(ctx): State<Arc<AppCtx>>,
    Path(page_id): Path<Uuid>,
    Json(req): Json<UpdatePageReq>,
) -> Result<Json<PageDto>, AppError> {
    if let Some(ref name) = req.name
        && name.trim().is_empty()
    {
        return Err(AppError::bad_request("name cannot be empty"));
    }
    let r = sqlx::query(
        "UPDATE pages SET
             name       = COALESCE($2, name),
             icon       = COALESCE($3, icon),
             sort_order = COALESCE($4, sort_order),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, instance_id, name, icon, kind, sort_order, created_at, updated_at",
    )
    .bind(page_id)
    .bind(&req.name)
    .bind(&req.icon)
    .bind(req.sort_order)
    .fetch_one(&ctx.pool)
    .await?;
    Ok(Json(row_to_page(&r)?))
}

#[derive(Serialize)]
pub struct DeleteResp {
    pub deleted: bool,
}

pub async fn delete(
    State(ctx): State<Arc<AppCtx>>,
    Path(page_id): Path<Uuid>,
) -> Result<Json<DeleteResp>, AppError> {
    let res = sqlx::query("DELETE FROM pages WHERE id = $1")
        .bind(page_id)
        .execute(&ctx.pool)
        .await?;
    Ok(Json(DeleteResp {
        deleted: res.rows_affected() > 0,
    }))
}

// ─── Widgets ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct WidgetDto {
    pub id: Uuid,
    pub page_id: Uuid,
    pub entity_id: String,
    pub size: WidgetSize,
    pub sort_order: i32,
    pub config: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WidgetSize {
    Small,
    Medium,
    Large,
}

impl WidgetSize {
    fn as_str(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }

    fn parse(s: &str) -> Result<Self, AppError> {
        match s {
            "small" => Ok(Self::Small),
            "medium" => Ok(Self::Medium),
            "large" => Ok(Self::Large),
            other => Err(AppError::internal(format!("unknown widget size: {other}"))),
        }
    }
}

fn row_to_widget(r: &sqlx::postgres::PgRow) -> Result<WidgetDto, AppError> {
    let size: String = r.get("size");
    Ok(WidgetDto {
        id: r.get("id"),
        page_id: r.get("page_id"),
        entity_id: r.get("entity_id"),
        size: WidgetSize::parse(&size)?,
        sort_order: r.get("sort_order"),
        config: r.get("config"),
        created_at: r.get("created_at"),
    })
}

pub async fn list_widgets(
    State(ctx): State<Arc<AppCtx>>,
    Path(page_id): Path<Uuid>,
) -> Result<Json<Vec<WidgetDto>>, AppError> {
    // Surface 404 when the page is gone so callers don't silently get [].
    let exists: bool = sqlx::query("SELECT EXISTS(SELECT 1 FROM pages WHERE id = $1)")
        .bind(page_id)
        .fetch_one(&ctx.pool)
        .await?
        .try_get(0)?;
    if !exists {
        return Err(AppError::not_found("page not found"));
    }

    let rows = sqlx::query(
        "SELECT id, page_id, entity_id, size, sort_order, config, created_at
         FROM page_widgets
         WHERE page_id = $1
         ORDER BY sort_order, created_at",
    )
    .bind(page_id)
    .fetch_all(&ctx.pool)
    .await?;

    let widgets = rows
        .iter()
        .map(row_to_widget)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(widgets))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateWidgetReq {
    pub entity_id: String,
    pub size: WidgetSize,
    pub sort_order: Option<i32>,
    pub config: Option<serde_json::Value>,
}

pub async fn create_widget(
    State(ctx): State<Arc<AppCtx>>,
    Path(page_id): Path<Uuid>,
    Json(req): Json<CreateWidgetReq>,
) -> Result<Json<WidgetDto>, AppError> {
    if req.entity_id.trim().is_empty() {
        return Err(AppError::bad_request("entity_id is required"));
    }

    let kind: String = sqlx::query("SELECT kind FROM pages WHERE id = $1")
        .bind(page_id)
        .fetch_one(&ctx.pool)
        .await?
        .get("kind");

    if kind != "custom" {
        return Err(AppError::bad_request(
            "widgets can only be added to custom pages",
        ));
    }

    let r = sqlx::query(
        "INSERT INTO page_widgets(page_id, entity_id, size, sort_order, config)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, page_id, entity_id, size, sort_order, config, created_at",
    )
    .bind(page_id)
    .bind(&req.entity_id)
    .bind(req.size.as_str())
    .bind(req.sort_order.unwrap_or(0))
    .bind(req.config.unwrap_or_else(|| serde_json::json!({})))
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(row_to_widget(&r)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdateWidgetReq {
    pub size: Option<WidgetSize>,
    pub sort_order: Option<i32>,
    pub config: Option<serde_json::Value>,
}

pub async fn update_widget(
    State(ctx): State<Arc<AppCtx>>,
    Path(widget_id): Path<Uuid>,
    Json(req): Json<UpdateWidgetReq>,
) -> Result<Json<WidgetDto>, AppError> {
    let r = sqlx::query(
        "UPDATE page_widgets SET
             size       = COALESCE($2, size),
             sort_order = COALESCE($3, sort_order),
             config     = COALESCE($4, config)
         WHERE id = $1
         RETURNING id, page_id, entity_id, size, sort_order, config, created_at",
    )
    .bind(widget_id)
    .bind(req.size.map(|s| s.as_str()))
    .bind(req.sort_order)
    .bind(req.config)
    .fetch_one(&ctx.pool)
    .await?;
    Ok(Json(row_to_widget(&r)?))
}

pub async fn delete_widget(
    State(ctx): State<Arc<AppCtx>>,
    Path(widget_id): Path<Uuid>,
) -> Result<Json<DeleteResp>, AppError> {
    let res = sqlx::query("DELETE FROM page_widgets WHERE id = $1")
        .bind(widget_id)
        .execute(&ctx.pool)
        .await?;
    Ok(Json(DeleteResp {
        deleted: res.rows_affected() > 0,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_kind_round_trip() {
        for k in [
            PageKind::Home,
            PageKind::Rooms,
            PageKind::Devices,
            PageKind::Custom,
        ] {
            let parsed = PageKind::parse(k.as_str()).ok().expect("parse ok");
            assert_eq!(parsed, k);
        }
    }

    #[test]
    fn page_kind_serializes_snake_case() {
        let v = serde_json::to_value(PageKind::Custom).unwrap();
        assert_eq!(v, serde_json::json!("custom"));
    }

    #[test]
    fn page_kind_rejects_unknown() {
        assert!(PageKind::parse("garbage").is_err());
    }

    #[test]
    fn widget_size_round_trip() {
        for s in [WidgetSize::Small, WidgetSize::Medium, WidgetSize::Large] {
            let parsed = WidgetSize::parse(s.as_str()).ok().expect("parse ok");
            assert_eq!(parsed, s);
        }
    }

    #[test]
    fn widget_size_deserializes_snake_case() {
        let s: WidgetSize = serde_json::from_value(serde_json::json!("medium")).unwrap();
        assert_eq!(s, WidgetSize::Medium);
    }

    #[test]
    fn widget_size_rejects_unknown() {
        let r: Result<WidgetSize, _> = serde_json::from_value(serde_json::json!("huge"));
        assert!(r.is_err());
    }
}
