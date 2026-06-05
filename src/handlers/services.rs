//! HA service call handler.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;

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
    // Extract entity_id string from the target.
    let entity_id_str = req
        .target
        .as_ref()
        .and_then(|t| t.entity_id.as_ref())
        .map(|eid| match eid {
            EntityIdOrList::Single(s) => s.clone(),
            EntityIdOrList::Multiple(v) => v.first().cloned().unwrap_or_default(),
        })
        .unwrap_or_default();

    // Merge entity_id from target into data body for the WS path.
    // Strip entity_id from data — it belongs in target, not data.
    let data_body = if req.data.is_object() && !req.data.is_null() {
        let mut d = req.data.clone();
        if let Some(obj) = d.as_object_mut() {
            obj.remove("entity_id");
        }
        d
    } else {
        serde_json::json!({})
    };

    // Try WS command channel first (fast path — reuses persistent connection).
    if let Some(entry) = ctx.conn_pool.instances.get(&id) {
        let instance = entry.value();
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = crate::state::WsCmd {
            domain: domain.clone(),
            service: service.clone(),
            entity_id: entity_id_str.clone(),
            data: data_body.clone(),
            reply: reply_tx,
        };

        // Send through channel — if the supervisor is running, this is instant.
        if instance.ws_cmd_tx.send(cmd).await.is_ok() {
            // Wait for the WS supervisor to return the result.
            match reply_rx.await {
                Ok(Ok(result)) => {
                    let context_id = result
                        .as_array()
                        .and_then(|arr| arr.first())
                        .and_then(|item| item.get("context"))
                        .and_then(|c| c.get("id"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    return Ok(Json(ServiceCallResp {
                        operation_id: Uuid::new_v4(),
                        context_id,
                    }));
                }
                Ok(Err(e)) => {
                    tracing::warn!(instance_id = %id, error = %e, "WS call_service failed, falling back to REST");
                }
                Err(_) => {
                    tracing::warn!(instance_id = %id, "WS call_service oneshot dropped, falling back to REST");
                }
            }
        }
    }

    // Fallback: REST API (original path).
    let r = sqlx::query("SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1")
        .bind(id)
        .fetch_one(&ctx.pool)
        .await?;
    let base_url: String = r.get("base_url");
    let access_token: String = r.get("access_token");
    let verify_tls: bool = r.get("verify_tls");

    let http = super::instance_http_client(&ctx, id, verify_tls);

    let mut body = data_body;

    if let Some(target) = req.target
        && let Some(entity_id) = target.entity_id
    {
        let ids: Value = match entity_id {
            EntityIdOrList::Single(s) => Value::String(s),
            EntityIdOrList::Multiple(v) => Value::Array(v.into_iter().map(Value::String).collect()),
        };
        if let Some(obj) = body.as_object_mut() {
            obj.insert("entity_id".to_string(), ids);
        }
    }

    let result = crate::ha::rest::call_service(&http, &base_url, &access_token, &domain, &service, body).await?;

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
