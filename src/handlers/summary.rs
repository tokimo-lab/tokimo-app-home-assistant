//! `GET /instances/:id/summary` — aggregate dashboard data.
//!
//! Computed in-memory from the live `EntityStore` snapshot — no extra round
//! trip to HA. Two pieces:
//!   - `unavailable_entities`: entities whose state is `"unavailable"` or
//!     `"unknown"`. Display name prefers the user override, then the HA
//!     `attributes.friendly_name`, finally the bare entity_id.
//!   - `domain_counts`: per-domain on/total tallies. Domains have different
//!     "active" semantics:
//!       * `light` / `switch` / `fan` / `input_boolean` / `automation` /
//!         `script` / `media_player` (≠ off/idle/standby) → state == "on"
//!       * `climate` → state != "off"
//!       * `lock` → state == "locked"
//!       * `cover` → state in {"open", "opening"}
//!       * `binary_sensor` → state == "on"
//!       * everything else → on_count = total_count (treated as informational)

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use serde::Serialize;
use uuid::Uuid;

use super::AppCtx;
use crate::error::AppError;

const UNAVAILABLE_STATES: &[&str] = &["unavailable", "unknown"];

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct UnavailableEntityRef {
    pub entity_id: String,
    pub name: String,
    pub last_changed: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DomainCount {
    pub domain: String,
    pub on_count: u32,
    pub total_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct InstanceSummary {
    pub unavailable_entities: Vec<UnavailableEntityRef>,
    pub domain_counts: Vec<DomainCount>,
}

/// Compute whether `state` represents the "active" state for the given
/// `domain`. See module docstring for the table.
fn is_on(domain: &str, state: &str) -> bool {
    match domain {
        "light" | "switch" | "fan" | "input_boolean" | "automation" | "script" | "binary_sensor" => state == "on",
        "media_player" => !matches!(state, "off" | "idle" | "standby" | "unavailable" | "unknown"),
        "climate" => state != "off" && !UNAVAILABLE_STATES.contains(&state),
        "lock" => state == "locked",
        "cover" => matches!(state, "open" | "opening"),
        // Default: everything counts as "on" (informational domains like
        // sensor / weather / sun where there is no on/off concept).
        _ => true,
    }
}

pub async fn get_summary(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<InstanceSummary>, AppError> {
    let instance = ctx
        .conn_pool
        .instances
        .get(&id)
        .ok_or_else(|| AppError::not_found("instance not found"))?
        .value()
        .clone();

    let mut unavailable: Vec<UnavailableEntityRef> = Vec::new();
    // BTreeMap so the response order is deterministic by domain name.
    let mut counts: BTreeMap<String, (u32, u32)> = BTreeMap::new();

    for entry in instance.store.states.iter() {
        let entity_id = entry.key();
        let state = entry.value();
        let domain = entity_id.split('.').next().unwrap_or("unknown").to_string();

        let agg = counts.entry(domain.clone()).or_insert((0, 0));
        agg.1 += 1;
        if is_on(&domain, &state.state) {
            agg.0 += 1;
        }

        if UNAVAILABLE_STATES.contains(&state.state.as_str()) {
            let override_name = instance
                .override_cache
                .get(entity_id)
                .and_then(|s| s.value().display_name.clone());
            let friendly = state
                .attributes
                .get("friendly_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let name = override_name.or(friendly).unwrap_or_else(|| entity_id.clone());
            unavailable.push(UnavailableEntityRef {
                entity_id: entity_id.clone(),
                name,
                last_changed: state.last_changed.clone(),
            });
        }
    }

    // Most-recently-changed unavailable entity first (ISO8601 sorts lexically).
    unavailable.sort_by(|a, b| b.last_changed.cmp(&a.last_changed));

    let domain_counts: Vec<DomainCount> = counts
        .into_iter()
        .map(|(domain, (on_count, total_count))| DomainCount {
            domain,
            on_count,
            total_count,
        })
        .collect();

    Ok(Json(InstanceSummary {
        unavailable_entities: unavailable,
        domain_counts,
    }))
}
