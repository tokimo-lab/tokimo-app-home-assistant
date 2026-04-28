//! Home Assistant REST client — thin wrapper around reqwest.
//!
//! Used for: connectivity test, service calls, area registry listing.

use reqwest::Client;
use serde::Deserialize;
use tracing::debug;

use crate::error::AppError;

/// Minimal HA `/api/` response (used for test).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct HaApiRoot {
    pub message: Option<String>,
}

/// Call `GET <base_url>/api/` and return version string if present.
pub async fn test_connection(http: &Client, base_url: &str, access_token: &str) -> Result<Option<String>, AppError> {
    let url = format!("{}/api/", base_url.trim_end_matches('/'));
    debug!(%url, "HA test connection");

    let resp = http
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA unreachable: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::unauthorized("HA rejected the access token"));
    }
    if !resp.status().is_success() {
        return Err(AppError::bad_gateway(format!("HA returned HTTP {}", resp.status())));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA response parse: {e}")))?;

    let version = body.get("version").and_then(|v| v.as_str()).map(str::to_string);

    Ok(version)
}

/// Call `POST <base_url>/api/services/<domain>/<service>`.
/// Returns the raw JSON array of changed states (or an object with context).
pub async fn call_service(
    http: &Client,
    base_url: &str,
    access_token: &str,
    domain: &str,
    service: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/api/services/{}/{}", base_url.trim_end_matches('/'), domain, service);
    debug!(%url, "HA service call");

    let resp = http
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA unreachable: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::unauthorized("HA rejected the access token"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::bad_gateway(format!("HA service call HTTP {status}: {text}")));
    }

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA response parse: {e}")))?;

    Ok(value)
}

/// Call `GET <base_url>/api/states` and return the parsed entity state list.
///
/// Used to seed `instance.store.states` on first SSE subscribe when the WS
/// supervisor hasn't yet bootstrapped (or is still reconnecting). Without this
/// seed the frontend's HomeView shows an empty state until HA pushes the next
/// `state_changed` event.
pub async fn get_states(
    http: &Client,
    base_url: &str,
    access_token: &str,
) -> Result<Vec<crate::state::EntityState>, AppError> {
    let url = format!("{}/api/states", base_url.trim_end_matches('/'));
    debug!(%url, "HA get_states fetch");

    let resp = http
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA unreachable: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::unauthorized("HA rejected the access token"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::bad_gateway(format!("HA get_states HTTP {status}")));
    }

    let states: Vec<crate::state::EntityState> = resp
        .json()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA states parse: {e}")))?;

    Ok(states)
}

/// Call `GET <base_url>/api/config/area_registry/list`.
pub async fn get_area_registry(
    http: &Client,
    base_url: &str,
    access_token: &str,
) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/api/config/area_registry/list", base_url.trim_end_matches('/'));
    debug!(%url, "HA area registry fetch");

    let resp = http
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA unreachable: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::unauthorized("HA rejected the access token"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::bad_gateway(format!("HA area registry HTTP {status}")));
    }

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::bad_gateway(format!("HA response parse: {e}")))?;

    Ok(value)
}
