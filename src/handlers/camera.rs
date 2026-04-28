//! Camera proxy: streams a single JPEG frame from
//! `{base_url}/api/camera_proxy/{entity_id}` back to the client.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header::CONTENT_TYPE},
    response::Response,
};
use sqlx::Row;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;

pub async fn camera_proxy(
    State(ctx): State<Arc<AppCtx>>,
    Path((instance_id, entity_id)): Path<(Uuid, String)>,
) -> Result<Response, AppError> {
    let row = sqlx::query("SELECT base_url, access_token, verify_tls FROM instances WHERE id = $1")
        .bind(instance_id)
        .fetch_optional(&ctx.pool)
        .await?
        .ok_or_else(|| AppError::not_found("instance not found"))?;

    let base_url: String = row.get("base_url");
    let access_token: String = row.get("access_token");
    let verify_tls: bool = row.get("verify_tls");

    let http = super::instance_http_client(&ctx, instance_id, verify_tls);

    let url = format!(
        "{}/api/camera_proxy/{}",
        base_url.trim_end_matches('/'),
        entity_id
    );

    let upstream = http
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA request failed: {e}")))?;

    let status = upstream.status();
    if !status.is_success() {
        let code = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        return Err(AppError {
            status: code,
            message: format!("HA camera_proxy returned {status}"),
        });
    }

    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("image/jpeg"));

    let bytes = upstream
        .bytes()
        .await
        .map_err(|e| AppError::bad_gateway(format!("read HA body: {e}")))?;

    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(CONTENT_TYPE, content_type);
    Ok(resp)
}
