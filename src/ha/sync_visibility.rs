//! First-import固化 of (hidden, collapsed, group_id, group_primary) onto
//! `entity_overrides`.
//!
//! Strategy: for every HA entity we know about, compute the four "default
//! presentation" fields, on first import, and `INSERT ... ON CONFLICT DO
//! UPDATE`. The UPDATE branch is gated on `seal_version`: rows store the
//! version of the heuristic that produced their current values, and DO
//! UPDATE only fires when the running code's `CURRENT_SEAL_VERSION` is
//! strictly greater. This propagates heuristic improvements (new pass,
//! tightened K-cap) to already-sealed deployments without needing a
//! manual reset, while leaving rows untouched between releases.
//!
//! The `seal_version` mechanism replaces the earlier "pristine triple"
//! guard which couldn't re-fire once a row was sealed once. Bumping the
//! version *will* overwrite a user's manually toggled `collapsed` flag
//! for that release, so only bump when the new heuristic is strictly an
//! improvement worth re-applying.
//!
//! Why固化 in DB instead of recomputing per-render in the frontend:
//!   * The frontend used to run a chain of dynamic filters (noise keyword
//!     match, domain-tier demotion, dedup-by-device) on every render which
//!     made debugging "where did 次卧灯 go?" extremely hard.
//!   * Persisting the decision means user can override any one cell by
//!     hand and the override sticks across reconnects / refreshes.
//!
//! The default rules:
//!   * `hidden` — `entity_category` ∈ {`diagnostic`, `config`}.
//!   * `collapsed` — pure domain-table lookup. Actuator-like domains
//!     (`light`, `switch`, `climate`, …) default visible; read-only and
//!     trigger-style domains (`sensor`, `binary_sensor`, `automation`,
//!     `script`, `scene`, …) default collapsed. Plus a per-entity
//!     name-keyword demotion for noise switches.
//!   * `group_id` — `device::{device_id}::{domain}` when device_id is known,
//!     else `name::{normalized_name}::{domain}`, else `None` (singleton).
//!   * `group_primary` — within a group, the entity with the most features
//!     wins. See `primary_sort_key` for the full sort key.

use std::collections::HashMap;

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// HA entity categories that should default to hidden in the dashboard.
const HIDDEN_BY_DEFAULT_CATEGORIES: &[&str] = &["diagnostic", "config"];

/// Bumped whenever the default-seal heuristic changes meaningfully (e.g.
/// a new pass like per-(room, domain) K-cap is added). Rows with a stored
/// `seal_version` strictly less than this re-fire DO UPDATE on the next
/// sync, propagating the new defaults to deployments that were already
/// sealed by a previous version. User manual toggles via PATCH /entities
/// land on a different write path, so bumping this *will* overwrite a
/// user's collapsed override — only bump when the new heuristic is
/// strictly an improvement worth re-applying.
///
/// History:
///   v1 — initial seal (hidden / collapsed-by-tier / group_id / group_primary).
///   v2 — added per-(area_id, domain) K-cap pass.
///   v3 — dropped K-cap; collapsed seeded from explicit domain table only.
const CURRENT_SEAL_VERSION: i32 = 3;

/// Domains that default to `collapsed = false` (visible inline on home).
/// Direct user-actuation surfaces — the home page exists primarily to
/// present these. `switch` is still subject to noise-keyword demotion in
/// `default_collapsed` for configuration-style switches.
const VISIBLE_DOMAINS: &[&str] = &[
    "light",
    "switch",
    "climate",
    "lock",
    "cover",
    "media_player",
    "fan",
    "vacuum",
    "humidifier",
    "water_heater",
    "siren",
    "valve",
    "input_boolean",
    "alarm_control_panel",
];

/// Domains that default to `collapsed = true` (folded under "Show more").
/// Read-only telemetry, environment summaries, and trigger-style entries
/// that flood the page with low-information tiles. The user can still pin
/// individual entities by toggling collapsed off via the settings UI.
const COLLAPSED_DOMAINS: &[&str] = &[
    "sensor",
    "binary_sensor",
    "weather",
    "sun",
    "device_tracker",
    "update",
    "automation",
    "script",
    "scene",
    "button",
];

/// Friendly-name keyword heuristics for switch demotion. Substring,
/// case-insensitive on the resolved friendly_name. Source: frontend
/// `SWITCH_NOISE_KEYWORDS` list.
const SWITCH_NOISE_KEYWORDS: &[&str] = &[
    "检测",
    "report",
    "诊断",
    "diagnostic",
    "ai ",
    "ai检测",
    "灵敏度",
    "sensitivity",
    "上下摆风",
    "左右摆风",
    "swing",
    "童锁",
    "锁定",
    "calibrate",
    "校准",
    "镜头校准",
    "通知",
    "提醒",
    "alarm",
    "buzzer",
    "蜂鸣",
    "指示灯",
    "indicator",
    "夜灯",
    "警告音",
    "状态显示",
    "osd",
    "时间戳",
    "水印",
    "watermark",
    "音频编码",
    "码率",
    "bitrate",
    "帧率",
    "fps",
    "摄像机控制",
    "移动侦测",
    "微光全彩",
    "移动追踪",
    "宽动态",
    "宽动态范围",
    "巡航",
    "巡航功能",
    "充电保护",
    "物理控制锁",
    "默认上电状态",
    "弹窗是否弹出过",
    "存储卡管理",
    "状态，true",
    "状态,true",
    "状态true",
    "true：启用中",
    "闹钟 开关",
    "勿扰 勿扰",
    "勿扰",
    "睡眠模式",
    "自动休眠",
    "弱电箱风扇自动休眠",
    "自定义功率保护",
    "最大功率限制",
    "快捷倒计时",
    "倒计时关闭",
    "门禁静音",
    "auto drying",
    "self-clean",
    "cleaning sequence",
    "auto open",
    "intercom auto open",
    "扬声器 静音",
    "静音",
];

/// Friendly-name keyword heuristics for binary_sensor demotion. Currently
/// unused — `binary_sensor` is unconditionally collapsed via the domain
/// table — kept for the day we resurrect a "promote noisy-name binary
/// sensors out of the collapsed bucket" pass without re-deriving the list.
#[allow(dead_code)]
const BINARY_SENSOR_NOISE_KEYWORDS: &[&str] = &[
    "滤网",
    "滤芯",
    "故障",
    "报警",
    "fault",
    "存储卡",
    "弹窗",
    "默认上电状态",
    "状态，true",
    "状态,true",
];

/// A single HA entity passed into the sync pass. Fields not strictly part of
/// `config/entity_registry/list` (friendly_name / supported_features /
/// attribute_count) are merged in at the call-site from the live state cache.
#[derive(Debug, Clone)]
pub struct HaEntityRegistryEntry {
    pub entity_id: String,
    /// HA entity category: `"diagnostic"`, `"config"`, or `None` for normal entities.
    pub entity_category: Option<String>,
    pub device_id: Option<String>,
    pub friendly_name: Option<String>,
    /// `entity_id` prefix before the dot. Always present (lowercase).
    pub domain: String,
    pub supported_features: Option<i64>,
    pub attribute_count: Option<i32>,
    /// Effective area: entity-level `area_id` if set, else inherited from
    /// the device's area. `None` for unassigned entities. Used purely for
    /// per-(area, domain) K-cap; not persisted (the user-overridable area
    /// lives on `entity_overrides.area_id` keyed by tokimo room UUID).
    pub area_id: Option<String>,
}

impl HaEntityRegistryEntry {
    /// Parse the registry-side fields from a `config/entity_registry/list`
    /// entry. Returns `None` for malformed entries (no entity_id).
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        let entity_id = v.get("entity_id")?.as_str()?.to_string();
        let domain = entity_id.split('.').next().unwrap_or("").to_string();
        let entity_category = v.get("entity_category").and_then(|c| c.as_str()).map(str::to_string);
        let device_id = v
            .get("device_id")
            .and_then(|c| c.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let area_id = v
            .get("area_id")
            .and_then(|c| c.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        Some(Self {
            entity_id,
            entity_category,
            device_id,
            friendly_name: None,
            domain,
            supported_features: None,
            attribute_count: None,
            area_id,
        })
    }

    /// Merge live-state info (friendly_name, supported_features,
    /// attribute_count) from an HA `state.attributes` JSON object.
    pub fn merge_attributes(&mut self, attributes: &serde_json::Value) {
        if let Some(obj) = attributes.as_object() {
            self.attribute_count = Some(obj.len() as i32);
            if let Some(name) = obj.get("friendly_name").and_then(|v| v.as_str()) {
                self.friendly_name = Some(name.to_string());
            }
            if let Some(sf) = obj.get("supported_features").and_then(|v| v.as_i64()) {
                self.supported_features = Some(sf);
            }
        }
    }

    fn default_hidden(&self) -> bool {
        self.entity_category
            .as_deref()
            .is_some_and(|c| HIDDEN_BY_DEFAULT_CATEGORIES.contains(&c))
    }

    /// Pure domain-table lookup with one per-entity exception:
    /// configuration-style switches (matched by friendly-name keyword)
    /// fold even though `switch` is in `VISIBLE_DOMAINS`.
    fn default_collapsed(&self) -> bool {
        let domain = self.domain.as_str();

        if VISIBLE_DOMAINS.contains(&domain) {
            if domain == "switch" {
                let name_lower = self
                    .friendly_name
                    .as_deref()
                    .map(|s| s.to_lowercase())
                    .unwrap_or_else(|| self.entity_id.to_lowercase());
                if SWITCH_NOISE_KEYWORDS.iter().any(|k| name_lower.contains(k)) {
                    return true;
                }
            }
            return false;
        }
        if COLLAPSED_DOMAINS.contains(&domain) {
            return true;
        }
        // Unknown domains stay visible by default — better to show an
        // unrecognised tile than to hide it under "Show more".
        false
    }

    /// Compute the group identifier used to dedupe duplicate entities that
    /// belong to the same physical device + domain. Returns `None` for
    /// "no group" — the entity is its own primary.
    fn compute_group_id(&self) -> Option<String> {
        if let Some(device_id) = &self.device_id {
            return Some(format!("device::{}::{}", device_id, self.domain));
        }
        if let Some(name) = &self.friendly_name {
            let normalized = name.trim().to_lowercase();
            if !normalized.is_empty() {
                return Some(format!("name::{}::{}", normalized, self.domain));
            }
        }
        None
    }

    /// Sort key for primary selection within a group. Higher rank wins.
    /// Order: most supported_features bits, then most attributes, then
    /// shortest friendly_name, then shortest entity_id, then lex entity_id.
    fn primary_sort_key(&self) -> (i32, i32, i32, i32, &str) {
        let bits = self.supported_features.map(|v| -(v.count_ones() as i32)).unwrap_or(0);
        let attrs = -self.attribute_count.unwrap_or(0);
        let name_len = self.friendly_name.as_ref().map(|s| s.len() as i32).unwrap_or(i32::MAX);
        let eid_len = self.entity_id.len() as i32;
        (bits, attrs, name_len, eid_len, self.entity_id.as_str())
    }
}

/// Per-entity decision baked at first import.
struct Decision {
    hidden: bool,
    collapsed: bool,
    group_id: Option<String>,
    group_primary: bool,
}

/// Outcome of a single sync pass, useful for logging / tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct SyncStats {
    pub inserted: usize,
    pub skipped_existing: usize,
}

/// Pure in-memory passes (1, 2) that turn `entries` into per-entity
/// `Decision`s. Extracted from `sync_default_visibility_and_grouping` so
/// the heuristic can be unit-tested without spinning up Postgres.
fn compute_decisions(entries: &[HaEntityRegistryEntry]) -> Vec<Decision> {
    // Pass 1: per-entity (hidden, collapsed, group_id).
    let mut groups: HashMap<String, Vec<usize>> = HashMap::new();
    let mut decisions: Vec<Decision> = Vec::with_capacity(entries.len());
    for (idx, e) in entries.iter().enumerate() {
        let group_id = e.compute_group_id();
        if let Some(g) = &group_id {
            groups.entry(g.clone()).or_default().push(idx);
        }
        decisions.push(Decision {
            hidden: e.default_hidden(),
            collapsed: e.default_collapsed(),
            group_id,
            group_primary: true,
        });
    }

    // Pass 2: within each group, demote non-primaries.
    for member_idxs in groups.values() {
        if member_idxs.len() <= 1 {
            continue;
        }
        let mut ranked: Vec<usize> = member_idxs.clone();
        ranked.sort_by(|&a, &b| entries[a].primary_sort_key().cmp(&entries[b].primary_sort_key()));
        // First entry in ranked = primary; rest = demoted.
        for &idx in ranked.iter().skip(1) {
            decisions[idx].group_primary = false;
        }
    }

    decisions
}

/// First-import固化: insert default (hidden, collapsed, group_id,
/// group_primary) for every HA entity that does not already have an
/// `entity_overrides` row. Existing rows are re-sealed only when the stored
/// `seal_version` is below `CURRENT_SEAL_VERSION`.
pub async fn sync_default_visibility_and_grouping(
    pool: &PgPool,
    instance_id: Uuid,
    entries: Vec<HaEntityRegistryEntry>,
) -> Result<SyncStats, AppError> {
    if entries.is_empty() {
        return Ok(SyncStats::default());
    }

    let decisions = compute_decisions(&entries);

    // Pass 3: persist. Single transaction, INSERT ... ON CONFLICT DO UPDATE.
    let mut tx = pool.begin().await?;
    let mut inserted = 0usize;
    let mut skipped = 0usize;

    for (e, d) in entries.iter().zip(decisions.iter()) {
        let res = sqlx::query(
            "INSERT INTO entity_overrides ( \
                instance_id, entity_id, hidden, entity_category, \
                collapsed, group_id, group_primary, seal_version \
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             ON CONFLICT (instance_id, entity_id) DO UPDATE SET \
                collapsed = EXCLUDED.collapsed, \
                group_id = EXCLUDED.group_id, \
                group_primary = EXCLUDED.group_primary, \
                seal_version = EXCLUDED.seal_version \
             WHERE \
                entity_overrides.seal_version < EXCLUDED.seal_version",
        )
        .bind(instance_id)
        .bind(&e.entity_id)
        .bind(d.hidden)
        .bind(e.entity_category.as_deref())
        .bind(d.collapsed)
        .bind(d.group_id.as_deref())
        .bind(d.group_primary)
        .bind(CURRENT_SEAL_VERSION)
        .execute(&mut *tx)
        .await?;

        if res.rows_affected() == 1 {
            inserted += 1;
        } else {
            skipped += 1;
        }
    }

    tx.commit().await?;

    Ok(SyncStats {
        inserted,
        skipped_existing: skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(eid: &str) -> HaEntityRegistryEntry {
        HaEntityRegistryEntry {
            entity_id: eid.to_string(),
            entity_category: None,
            device_id: None,
            friendly_name: None,
            domain: eid.split('.').next().unwrap().to_string(),
            supported_features: None,
            attribute_count: None,
            area_id: None,
        }
    }

    #[test]
    fn default_hidden_only_for_diagnostic_or_config() {
        let mut e = entry("sensor.foo");
        assert!(!e.default_hidden());
        e.entity_category = Some("diagnostic".into());
        assert!(e.default_hidden());
        e.entity_category = Some("config".into());
        assert!(e.default_hidden());
        e.entity_category = Some("primary".into());
        assert!(!e.default_hidden());
    }

    #[test]
    fn collapsed_follows_domain_table() {
        // Read-only telemetry → collapsed.
        assert!(entry("sensor.foo").default_collapsed());
        assert!(entry("binary_sensor.door").default_collapsed());
        assert!(entry("weather.home").default_collapsed());
        assert!(entry("sun.sun").default_collapsed());
        assert!(entry("device_tracker.phone").default_collapsed());
        assert!(entry("update.firmware").default_collapsed());
        assert!(entry("button.reboot").default_collapsed());
        // Trigger-style → collapsed.
        assert!(entry("automation.morning").default_collapsed());
        assert!(entry("script.bedtime").default_collapsed());
        assert!(entry("scene.movie").default_collapsed());
        // Actuators → visible.
        assert!(!entry("light.bedroom").default_collapsed());
        assert!(!entry("switch.fan").default_collapsed());
        assert!(!entry("climate.ac").default_collapsed());
        assert!(!entry("lock.front").default_collapsed());
        assert!(!entry("cover.garage").default_collapsed());
        assert!(!entry("media_player.tv").default_collapsed());
        assert!(!entry("fan.living").default_collapsed());
        assert!(!entry("vacuum.robot").default_collapsed());
        assert!(!entry("humidifier.bedroom").default_collapsed());
        assert!(!entry("water_heater.tank").default_collapsed());
        assert!(!entry("siren.alarm").default_collapsed());
        assert!(!entry("valve.water").default_collapsed());
        assert!(!entry("input_boolean.guest").default_collapsed());
        assert!(!entry("alarm_control_panel.house").default_collapsed());
        // Unknown domain → visible (don't fold what we don't recognise).
        assert!(!entry("group.living_room").default_collapsed());
    }

    #[test]
    fn collapsed_demotes_noise_switch() {
        let mut e = entry("switch.living");
        e.friendly_name = Some("AI 检测".into());
        assert!(e.default_collapsed());

        let mut clean = entry("switch.living");
        clean.friendly_name = Some("Living Room Lamp".into());
        assert!(!clean.default_collapsed());
    }

    #[test]
    fn group_id_prefers_device_id() {
        let mut e = entry("light.foo");
        e.device_id = Some("dev123".into());
        e.friendly_name = Some("Foo Lamp".into());
        assert_eq!(e.compute_group_id().as_deref(), Some("device::dev123::light"));
    }

    #[test]
    fn group_id_falls_back_to_name() {
        let mut e = entry("light.foo");
        e.friendly_name = Some("  Bedroom Light  ".into());
        assert_eq!(e.compute_group_id().as_deref(), Some("name::bedroom light::light"));
    }

    #[test]
    fn group_id_none_without_name_or_device() {
        let e = entry("light.foo");
        assert!(e.compute_group_id().is_none());
    }

    #[test]
    fn from_json_extracts_device_id() {
        let v = json!({"entity_id": "light.kitchen", "device_id": "abc", "entity_category": null});
        let e = HaEntityRegistryEntry::from_json(&v).unwrap();
        assert_eq!(e.device_id.as_deref(), Some("abc"));
        assert_eq!(e.domain, "light");
    }

    #[test]
    fn merge_attributes_pulls_friendly_name_and_features() {
        let mut e = entry("light.kitchen");
        e.merge_attributes(&json!({
            "friendly_name": "Kitchen Light",
            "supported_features": 63,
            "brightness": 100,
            "color_mode": "rgb"
        }));
        assert_eq!(e.friendly_name.as_deref(), Some("Kitchen Light"));
        assert_eq!(e.supported_features, Some(63));
        assert_eq!(e.attribute_count, Some(4));
    }

    #[test]
    fn primary_election_picks_richest_entity() {
        let mut a = entry("light.a");
        a.friendly_name = Some("Lamp".into());
        a.supported_features = Some(0b111); // 3 bits
        a.attribute_count = Some(5);

        let mut b = entry("light.b");
        b.friendly_name = Some("Lamp".into());
        b.supported_features = Some(0b1); // 1 bit
        b.attribute_count = Some(2);

        // a should outrank b
        assert!(a.primary_sort_key() < b.primary_sort_key());
    }

    #[test]
    fn from_json_extracts_area_id() {
        let v = json!({"entity_id": "light.kitchen", "area_id": "kitchen"});
        let e = HaEntityRegistryEntry::from_json(&v).unwrap();
        assert_eq!(e.area_id.as_deref(), Some("kitchen"));

        let v2 = json!({"entity_id": "light.kitchen", "area_id": ""});
        let e2 = HaEntityRegistryEntry::from_json(&v2).unwrap();
        assert!(e2.area_id.is_none());
    }

    #[test]
    fn compute_decisions_does_not_apply_per_room_cap() {
        // 30 lights in one room must all stay visible — domain table is
        // the only collapsed gate, no overflow demotion.
        let entries: Vec<HaEntityRegistryEntry> = (0..30)
            .map(|i| {
                let mut e = entry(&format!("light.l{i}"));
                e.area_id = Some("kitchen".into());
                e.friendly_name = Some(format!("Light {i}"));
                e
            })
            .collect();
        let decisions = compute_decisions(&entries);
        let visible = decisions.iter().filter(|d| !d.collapsed && d.group_primary).count();
        assert_eq!(visible, 30, "all 30 lights stay visible without K-cap");
    }
}
