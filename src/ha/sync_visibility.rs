//! First-import固化 of (hidden, collapsed, group_id, group_primary) onto
//! `entity_overrides`.
//!
//! Strategy: for every HA entity we know about, compute the four "default
//! presentation" fields *once*, on first import, and `INSERT ... ON CONFLICT
//! DO NOTHING`. Existing rows are never touched — any user manual toggle is
//! sacred.
//!
//! Why固化 in DB instead of recomputing per-render in the frontend:
//!   * The frontend used to run a chain of dynamic filters (noise keyword
//!     match, domain-tier demotion, dedup-by-device) on every render which
//!     made debugging "where did 次卧灯 go?" extremely hard.
//!   * Persisting the decision means user can override any one cell by
//!     hand and the override sticks across reconnects / refreshes.
//!
//! The default rules ported from the previous frontend logic
//! (`ui/src/components/home/_helpers.ts`):
//!   * `hidden` — `entity_category` ∈ {`diagnostic`, `config`}.
//!   * `collapsed` — Tier-3 demotion: noise-keyword switch / binary_sensor,
//!     or any non-Tier-1/2/binary_sensor domain. Collapsed entities still
//!     render but live under a "show all" reveal.
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

/// Domains whose primary purpose is direct user actuation. Visible by
/// default. Mirrors `TIER1_DOMAINS` in the frontend.
const TIER1_DOMAINS: &[&str] = &[
    "light",
    "switch",
    "input_boolean",
    "climate",
    "cover",
    "fan",
    "lock",
    "media_player",
    "vacuum",
    "water_heater",
    "humidifier",
    "alarm_control_panel",
];

/// Trigger-style domains: scenes / scripts / automations. Visible by default.
const TIER2_DOMAINS: &[&str] = &["scene", "script", "automation"];

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

/// Friendly-name keyword heuristics for binary_sensor demotion. Source:
/// frontend `BINARY_SENSOR_NOISE_KEYWORDS` list.
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
}

impl HaEntityRegistryEntry {
    /// Parse the registry-side fields from a `config/entity_registry/list`
    /// entry. Returns `None` for malformed entries (no entity_id).
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        let entity_id = v.get("entity_id")?.as_str()?.to_string();
        let domain = entity_id.split('.').next().unwrap_or("").to_string();
        let entity_category = v
            .get("entity_category")
            .and_then(|c| c.as_str())
            .map(str::to_string);
        let device_id = v
            .get("device_id")
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

    /// Tier-3 demotion. Mirrors the frontend `domainTier(...) == 3` path.
    fn default_collapsed(&self) -> bool {
        let domain = self.domain.as_str();
        let name_lower = self
            .friendly_name
            .as_deref()
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| self.entity_id.to_lowercase());

        if TIER1_DOMAINS.contains(&domain) {
            // Tier-1 normally stays uncollapsed. switch is demoted to
            // collapsed when its name matches the noise keyword list
            // (configuration-style switches that pollute the home page).
            if domain == "switch" && SWITCH_NOISE_KEYWORDS.iter().any(|k| name_lower.contains(k)) {
                return true;
            }
            return false;
        }
        if TIER2_DOMAINS.contains(&domain) {
            return false;
        }
        if domain == "binary_sensor" {
            // Noise binary sensors (filter / fault / alarm…) collapse;
            // everything else stays expanded. Critical-class promotion
            // doesn't matter for the collapsed flag — a normal binary
            // sensor is already Tier-2-equivalent for visibility.
            return BINARY_SENSOR_NOISE_KEYWORDS
                .iter()
                .any(|k| name_lower.contains(k));
        }
        // Anything else (sensor without env class, button, update,
        // weather, …) is Tier 3 → collapsed.
        true
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
        let bits = self
            .supported_features
            .map(|v| -(v.count_ones() as i32))
            .unwrap_or(0);
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

/// First-import固化: insert default (hidden, collapsed, group_id,
/// group_primary) for every HA entity that does not already have an
/// `entity_overrides` row. Existing rows are completely untouched.
pub async fn sync_default_visibility_and_grouping(
    pool: &PgPool,
    instance_id: Uuid,
    entries: Vec<HaEntityRegistryEntry>,
) -> Result<SyncStats, AppError> {
    if entries.is_empty() {
        return Ok(SyncStats::default());
    }

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
        ranked.sort_by(|&a, &b| {
            entries[a]
                .primary_sort_key()
                .cmp(&entries[b].primary_sort_key())
        });
        // First entry in ranked = primary; rest = demoted.
        for &idx in ranked.iter().skip(1) {
            decisions[idx].group_primary = false;
        }
    }

    // Pass 3: persist. Single transaction, INSERT ... ON CONFLICT DO NOTHING.
    let mut tx = pool.begin().await?;
    let mut inserted = 0usize;
    let mut skipped = 0usize;

    for (e, d) in entries.iter().zip(decisions.iter()) {
        let res = sqlx::query(
            "INSERT INTO entity_overrides ( \
                instance_id, entity_id, hidden, entity_category, \
                collapsed, group_id, group_primary \
             ) VALUES ($1, $2, $3, $4, $5, $6, $7) \
             ON CONFLICT (instance_id, entity_id) DO NOTHING",
        )
        .bind(instance_id)
        .bind(&e.entity_id)
        .bind(d.hidden)
        .bind(e.entity_category.as_deref())
        .bind(d.collapsed)
        .bind(d.group_id.as_deref())
        .bind(d.group_primary)
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
    fn collapsed_demotes_tier3_domains() {
        // sensor without env class → Tier 3 → collapsed
        assert!(entry("sensor.foo").default_collapsed());
        // light → Tier 1 → not collapsed
        assert!(!entry("light.bedroom").default_collapsed());
        // scene → Tier 2 → not collapsed
        assert!(!entry("scene.movie").default_collapsed());
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
        assert_eq!(
            e.compute_group_id().as_deref(),
            Some("name::bedroom light::light")
        );
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
}
