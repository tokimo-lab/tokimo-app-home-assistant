//! Instance CRUD handlers.

use std::sync::Arc;

use axum::{Json, extract::{Path, State}};
use serde::Deserialize;
use sqlx::Row;
use tracing::info;
use url::Url;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::{InstanceConfig, InstanceCtx};
use super::{AppCtx, InstanceDto, MaskedToken, instance_status_value};

// ─── List ─────────────────────────────────────────────────────────────────────

pub async fn list(
    State(ctx): State<Arc<AppCtx>>,
) -> Result<Json<Vec<InstanceDto>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, name, base_url, access_token, verify_tls, last_connected_at, created_at, updated_at
         FROM instances ORDER BY created_at",
    )
    .fetch_all(&ctx.pool)
    .await?;

    let mut instances: Vec<InstanceDto> = Vec::with_capacity(rows.len());
    for r in rows {
        let id: Uuid = r.get("id");
        instances.push(InstanceDto {
            id,
            name: r.get("name"),
            base_url: r.get("base_url"),
            access_token: MaskedToken(r.get("access_token")),
            verify_tls: r.get("verify_tls"),
            status: instance_status_value(&ctx, id).await,
            last_connected_at: r.get("last_connected_at"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        });
    }

    Ok(Json(instances))
}

// ─── Get ──────────────────────────────────────────────────────────────────────

pub async fn get(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<InstanceDto>, AppError> {
    let r = sqlx::query(
        "SELECT id, name, base_url, access_token, verify_tls, last_connected_at, created_at, updated_at
         FROM instances WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&ctx.pool)
    .await?;

    Ok(Json(InstanceDto {
        id: r.get("id"),
        name: r.get("name"),
        base_url: r.get("base_url"),
        access_token: MaskedToken(r.get("access_token")),
        verify_tls: r.get("verify_tls"),
        status: instance_status_value(&ctx, id).await,
        last_connected_at: r.get("last_connected_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }))
}

// ─── Create ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateReq {
    pub name: Option<String>,
    pub base_url: String,
    pub access_token: String,
    pub verify_tls: Option<bool>,
}

pub async fn create(
    State(ctx): State<Arc<AppCtx>>,
    Json(req): Json<CreateReq>,
) -> Result<Json<InstanceDto>, AppError> {
    validate_base_url(&req.base_url)?;

    let name = req.name.unwrap_or_else(|| "My Home Assistant".to_string());
    let verify_tls = req.verify_tls.unwrap_or(true);

    let r = sqlx::query(
        "INSERT INTO instances(name, base_url, access_token, verify_tls)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, base_url, access_token, verify_tls, last_connected_at, created_at, updated_at",
    )
    .bind(&name)
    .bind(&req.base_url)
    .bind(&req.access_token)
    .bind(verify_tls)
    .fetch_one(&ctx.pool)
    .await?;

    let id: Uuid = r.get("id");
    info!(%id, "instance: created");

    let instance_ctx = InstanceCtx::new(
        id,
        InstanceConfig {
            base_url: req.base_url.clone(),
            access_token: req.access_token.clone(),
            verify_tls,
        },
    );
    ctx.conn_pool.add_instance(instance_ctx);

    Ok(Json(InstanceDto {
        id,
        name: r.get("name"),
        base_url: r.get("base_url"),
        access_token: MaskedToken(r.get("access_token")),
        verify_tls: r.get("verify_tls"),
        status: instance_status_value(&ctx, id).await,
        last_connected_at: r.get("last_connected_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }))
}

// ─── Update ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdateReq {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub access_token: Option<String>,
    pub verify_tls: Option<bool>,
}

pub async fn update(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateReq>,
) -> Result<Json<InstanceDto>, AppError> {
    if let Some(url) = &req.base_url {
        validate_base_url(url)?;
    }

    // Fetch current values.
    let current = sqlx::query(
        "SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&ctx.pool)
    .await?;

    let new_base_url = req.base_url.as_deref().unwrap_or(current.get("base_url"));
    let new_token = req
        .access_token
        .as_deref()
        .unwrap_or(current.get("access_token"));
    let new_verify_tls: bool = req.verify_tls.unwrap_or(current.get("verify_tls"));

    let r = sqlx::query(
        "UPDATE instances SET
             name = COALESCE($2, name),
             base_url = $3,
             access_token = $4,
             verify_tls = $5,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, base_url, access_token, verify_tls, last_connected_at, created_at, updated_at",
    )
    .bind(id)
    .bind(&req.name)
    .bind(new_base_url)
    .bind(new_token)
    .bind(new_verify_tls)
    .fetch_one(&ctx.pool)
    .await?;

    // Restart supervisor only when connection-relevant fields changed.
    let conn_changed = req.base_url.is_some() || req.access_token.is_some();
    if conn_changed {
        info!(%id, "instance: config changed, restarting supervisor");
        ctx.conn_pool
            .restart_instance(
                id,
                InstanceConfig {
                    base_url: new_base_url.to_string(),
                    access_token: new_token.to_string(),
                    verify_tls: new_verify_tls,
                },
            )
            .await;
    }

    Ok(Json(InstanceDto {
        id: r.get("id"),
        name: r.get("name"),
        base_url: r.get("base_url"),
        access_token: MaskedToken(r.get("access_token")),
        verify_tls: r.get("verify_tls"),
        status: instance_status_value(&ctx, id).await,
        last_connected_at: r.get("last_connected_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }))
}

// ─── Delete ───────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DeleteResp {
    deleted: bool,
}

pub async fn delete(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<DeleteResp>, AppError> {
    ctx.conn_pool.remove_instance(id);
    let res = sqlx::query("DELETE FROM instances WHERE id = $1")
        .bind(id)
        .execute(&ctx.pool)
        .await?;
    Ok(Json(DeleteResp {
        deleted: res.rows_affected() > 0,
    }))
}

// ─── Test connection ──────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TestResp {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn test(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<TestResp>, AppError> {
    let r = sqlx::query("SELECT base_url, access_token FROM instances WHERE id = $1")
        .bind(id)
        .fetch_one(&ctx.pool)
        .await?;

    let base_url: String = r.get("base_url");
    let access_token: String = r.get("access_token");

    match crate::ha::rest::test_connection(&ctx.conn_pool.http, &base_url, &access_token).await {
        Ok(version) => Ok(Json(TestResp { ok: true, version, error: None })),
        Err(e) => Ok(Json(TestResp { ok: false, version: None, error: Some(e.message) })),
    }
}

// ─── Status ───────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct StatusResp {
    connection: serde_json::Value,
}

pub async fn status(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<StatusResp>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let status = instance.status.read().await;
    let connection = serde_json::to_value(&**status)
        .map_err(|e| AppError::internal(format!("serialize status: {e}")))?;

    Ok(Json(StatusResp { connection }))
}

// ─── SSRF guard ───────────────────────────────────────────────────────────────

fn validate_base_url(raw: &str) -> Result<(), AppError> {
    let url =
        Url::parse(raw).map_err(|e| AppError::bad_request(format!("invalid base_url: {e}")))?;
    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(AppError::bad_request(format!(
                "base_url scheme must be http or https, got: {other}"
            )));
        }
    }
    if url.host_str().map(|h| h.is_empty()).unwrap_or(true) {
        return Err(AppError::bad_request("base_url must have a host"));
    }
    // Private/LAN IPs are intentionally allowed — HA lives on local network.
    Ok(())
}
