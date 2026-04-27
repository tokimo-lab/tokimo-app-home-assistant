//! HA service call handler.

use std::sync::Arc;

use axum::{Json, extract::{Path, State}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use crate::error::AppError;
use super::AppCtx;

#[derive(Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct ServiceCallReq {
    /// Optional target. Supports `entity_id` as string or array.
    pub target: Option<ServiceTarget>,
    /// Arbitrary extra data forwarded verbatim to HA.
    #[serde(default)]
    pub data: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ServiceTarget {
    pub entity_id: Option<EntityIdOrList>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum EntityIdOrList {
    Single(String),
    Multiple(Vec<String>),
}

#[derive(Serialize)]
pub struct ServiceCallResp {
    pub operation_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
}

pub async fn call_service(
    State(ctx): State<Arc<AppCtx>>,
    Path((id, domain, service)): Path<(Uuid, String, String)>,
    Json(req): Json<ServiceCallReq>,
) -> Result<Json<ServiceCallResp>, AppError> {
    let r = sqlx::query("SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1")
        .bind(id)
        .fetch_one(&ctx.pool)
        .await?;
    let base_url: String = r.get("base_url");
    let access_token: String = r.get("access_token");
    let verify_tls: bool = r.get("verify_tls");

    let http = super::instance_http_client(&ctx, id, verify_tls);

    // Merge entity_id from target into the body forwarded to HA.
    let mut body = if req.data.is_object() {
        req.data
    } else {
        serde_json::json!({})
    };

    if let Some(target) = req.target
        && let Some(entity_id) = target.entity_id {
            let ids: Value = match entity_id {
                EntityIdOrList::Single(s) => Value::String(s),
                EntityIdOrList::Multiple(v) => Value::Array(
                    v.into_iter().map(Value::String).collect(),
                ),
            };
            if let Some(obj) = body.as_object_mut() {
                obj.insert("entity_id".to_string(), ids);
            }
        }

    let result = crate::ha::rest::call_service(
        &http,
        &base_url,
        &access_token,
        &domain,
        &service,
        body,
    )
    .await?;

    // Extract context.id from first item in result array (if present).
    let context_id = result
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("context"))
        .and_then(|c| c.get("id"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    Ok(Json(ServiceCallResp {
        operation_id: Uuid::new_v4(),
        context_id,
    }))
}
