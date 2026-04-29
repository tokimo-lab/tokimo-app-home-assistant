//! Visibility helpers for HA entity-registry sync.
//!
//! When HA's entity registry is fetched during initial sync or a forced
//! refresh, this module ensures every known entity has an `entity_overrides`
//! row that carries (a) the HA `entity_category` (`"diagnostic"`, `"config"`,
//! or `NULL` for primary entities) and (b) a sensible default `hidden` value
//! derived from that category — diagnostic/config default to hidden, primary
//! entities default to visible.
//!
//! Two invariants protect existing user choices:
//!
//! 1. The row is created with `INSERT ... ON CONFLICT DO UPDATE` but the
//!    `hidden` column is only flipped on the *first* classification — i.e.
//!    when the existing row's `entity_category` is still `NULL`. After that
//!    we leave `hidden` alone forever, so any subsequent user toggle is
//!    preserved.
//! 2. `entity_category` itself is always refreshed from HA so reclassifications
//!    on the HA side propagate (but never re-trigger the hidden default).

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// HA entity categories that should default to hidden in the dashboard.
const HIDDEN_BY_DEFAULT_CATEGORIES: &[&str] = &["diagnostic", "config"];

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

    fn default_hidden(&self) -> bool {
        self.entity_category
            .as_deref()
            .is_some_and(|c| HIDDEN_BY_DEFAULT_CATEGORIES.contains(&c))
    }
}

/// Outcome of a single sync pass, useful for logging / tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct SyncStats {
    /// Brand-new override rows created.
    pub inserted: usize,
    /// Pre-existing rows whose `hidden` was flipped to `true` because they were
    /// being classified for the first time and HA reports them as
    /// `diagnostic`/`config`.
    pub backfilled_hidden: usize,
    /// Total rows touched (insert + update of `entity_category`).
    pub touched: usize,
}

/// Synchronise entity-category metadata into `entity_overrides`.
///
/// For every entry in the HA entity registry we:
/// * insert an override row (if missing) with `hidden` defaulted from the
///   category and the category itself stored,
/// * or, on conflict, refresh `entity_category` and — *only the first time we
///   ever classify the row* — apply the default-hidden rule for
///   diagnostic/config entities.
///
/// This makes the function safe to call on every reconnect: existing user
/// hidden/visible choices are never overwritten after their initial
/// classification.
pub async fn mark_default_hidden_for_entities(
    pool: &PgPool,
    instance_id: Uuid,
    entries: &[HaEntityRegistryEntry],
) -> Result<SyncStats, AppError> {
    let mut stats = SyncStats::default();

    for entry in entries {
        let default_hidden = entry.default_hidden();
        let category = entry.entity_category.as_deref();

        // `xmax = 0` on the returned tuple means the row was just inserted
        // (otherwise it's an UPDATE). We use that to count inserts vs updates
        // without a second round-trip.
        let row: Option<(bool, bool)> = sqlx::query_as(
            "INSERT INTO entity_overrides (instance_id, entity_id, hidden, entity_category) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (instance_id, entity_id) DO UPDATE \
             SET hidden = CASE \
                     WHEN entity_overrides.entity_category IS NULL \
                          AND EXCLUDED.entity_category = ANY($5) \
                     THEN TRUE \
                     ELSE entity_overrides.hidden \
                 END, \
                 entity_category = EXCLUDED.entity_category, \
                 updated_at = NOW() \
             RETURNING (xmax = 0) AS inserted, hidden",
        )
        .bind(instance_id)
        .bind(&entry.entity_id)
        .bind(default_hidden)
        .bind(category)
        .bind(HIDDEN_BY_DEFAULT_CATEGORIES)
        .fetch_optional(pool)
        .await?;

        let Some((inserted, hidden_after)) = row else { continue };
        stats.touched += 1;
        if inserted {
            stats.inserted += 1;
        } else if default_hidden && hidden_after {
            // Pre-existing row that we just classified for the first time and
            // whose hidden flag is now `true` — this is the backfill path.
            // (Some of these may already have been hidden=true; we slightly
            // over-count, which is fine for a best-effort log metric.)
            stats.backfilled_hidden += 1;
        }
    }

    Ok(stats)
}
