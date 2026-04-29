//! Visibility helpers for HA entity-registry sync.
//!
//! When HA's entity registry is fetched during initial sync or a forced
//! refresh, this module marks "diagnostic" and "config" category entities
//! as hidden-by-default in `entity_overrides`. The write is
//! **INSERT … ON CONFLICT DO NOTHING** so user overrides are never clobbered.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// A single entry from HA's `config/entity_registry/list` response.
/// Only the fields needed for visibility classification are included.
#[derive(Debug)]
pub struct HaEntityRegistryEntry {
    pub entity_id: String,
    /// HA entity category: `"diagnostic"`, `"config"`, or `None` for normal entities.
    pub entity_category: Option<String>,
}

impl HaEntityRegistryEntry {
    /// Parse from a raw `serde_json::Value` array element (best-effort).
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        let entity_id = v.get("entity_id")?.as_str()?.to_string();
        let entity_category = v
            .get("entity_category")
            .and_then(|c| c.as_str())
            .map(str::to_string);
        Some(Self { entity_id, entity_category })
    }
}

/// Marks diagnostic/config-category entities as hidden-by-default.
///
/// For each entry whose `entity_category` is `"diagnostic"` or `"config"`,
/// inserts a row in `entity_overrides` with `hidden = true` using
/// `ON CONFLICT DO NOTHING` so that any explicit user override is preserved.
///
/// Returns the number of rows that were actually inserted (i.e. entities that
/// had no prior override and were newly marked hidden).
///
/// TODO(P1.0-impl): Wire this into the `refresh_registries` call in `ws.rs`
///   once the function signature is stable. Currently a no-op scaffold.
pub async fn mark_default_hidden_for_diagnostic_entities(
    pool: &PgPool,
    instance_id: Uuid,
    entries: &[HaEntityRegistryEntry],
) -> Result<usize, AppError> {
    let mut count: usize = 0;

    for entry in entries {
        let Some(cat) = &entry.entity_category else { continue };
        if cat != "diagnostic" && cat != "config" {
            continue;
        }

        let inserted = sqlx::query(
            "INSERT INTO entity_overrides (instance_id, entity_id, hidden) \
             VALUES ($1, $2, true) \
             ON CONFLICT (instance_id, entity_id) DO NOTHING \
             RETURNING entity_id",
        )
        .bind(instance_id)
        .bind(&entry.entity_id)
        .fetch_optional(pool)
        .await?;

        if inserted.is_some() {
            count += 1;
        }
    }

    Ok(count)
}
