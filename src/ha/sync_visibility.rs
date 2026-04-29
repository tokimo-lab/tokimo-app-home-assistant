//! Default-presentation seal of (hidden, collapsed, group_id, group_primary)
//! onto `entity_overrides`.
//!
//! Strategy: for every HA entity we know about, compute the four "default
//! presentation" fields and `INSERT ... ON CONFLICT DO NOTHING`. Existing
//! rows are left unchanged to preserve user manual adjustments. Only new
//! entities get the computed default values.
//!
//! Why seal in DB instead of recomputing per-render in the frontend:
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
//!   * `group_id` (Accessory ID) — three-layer fallback:
//!     1. Same device_id → `device::{device_id}` (no domain suffix)
//!     2. Same via_device + area → `via::{root_device_id}::{area_id}`
//!     3. Same area + LCP clustering → `name::{base_sha1}::{area_id}`
//!     4. None of above → `None` (singleton)
//!   * `group_primary` — within an accessory, the entity with the highest
//!     domain priority (light > climate > cover > media_player > fan >
//!     lock > switch > input_boolean > sensor > binary_sensor > others),
//!     then most supported_features, then shortest friendly_name wins.

use std::collections::HashMap;

use sha1::{Digest, Sha1};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// HA entity categories that should default to hidden in the dashboard.
const HIDDEN_BY_DEFAULT_CATEGORIES: &[&str] = &["diagnostic", "config"];

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
    /// The parent device this entity's device is connected through (hub/gateway).
    pub via_device_id: Option<String>,
    pub friendly_name: Option<String>,
    /// `entity_id` prefix before the dot. Always present (lowercase).
    pub domain: String,
    pub supported_features: Option<i64>,
    pub attribute_count: Option<i32>,
    /// Effective area: entity-level `area_id` if set, else inherited from
    /// the device's area. `None` for unassigned entities.
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
        let via_device_id = v
            .get("via_device_id")
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
            via_device_id,
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

    /// Compute the group identifier (accessory ID) using Layer 1 only:
    /// Same device_id → `device::{device_id}` (no domain, allowing cross-domain aggregation)
    /// This is used in tests and as part of the layer-1 logic.
    #[cfg(test)]
    fn compute_group_id(&self) -> Option<String> {
        // Layer 1: Same device_id
        if let Some(device_id) = &self.device_id {
            return Some(format!("device::{}", device_id));
        }
        None
    }

    /// Domain priority for primary selection within an accessory.
    /// Lower value = higher priority.
    fn domain_priority(&self) -> u8 {
        match self.domain.as_str() {
            "light" => 0,
            "climate" => 1,
            "cover" => 2,
            "media_player" => 3,
            "fan" => 4,
            "lock" => 5,
            "switch" => 6,
            "input_boolean" => 7,
            "sensor" => 8,
            "binary_sensor" => 9,
            _ => 10,
        }
    }

    /// Sort key for primary selection within an accessory. Lower rank wins.
    /// Order: domain priority, then most supported_features, then shortest
    /// friendly_name, then entity_id.
    fn primary_sort_key(&self) -> (u8, i64, usize, &str) {
        let priority = self.domain_priority();
        // Negate count_ones to sort descending (more features = lower sort key)
        let features = 0 - (self.supported_features.unwrap_or(0).count_ones() as i64);
        let name_len = self
            .friendly_name
            .as_ref()
            .map(|s| s.chars().count())
            .unwrap_or(usize::MAX);
        (priority, features, name_len, self.entity_id.as_str())
    }
}

/// Per-entity decision baked at first import.
struct Decision {
    hidden: bool,
    collapsed: bool,
    group_id: Option<String>,
    group_primary: bool,
}

/// Union-Find data structure for clustering entities.
struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    fn new(size: usize) -> Self {
        Self {
            parent: (0..size).collect(),
            rank: vec![0; size],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]);
        }
        self.parent[x]
    }

    fn union(&mut self, x: usize, y: usize) {
        let root_x = self.find(x);
        let root_y = self.find(y);
        if root_x == root_y {
            return;
        }
        match self.rank[root_x].cmp(&self.rank[root_y]) {
            std::cmp::Ordering::Less => self.parent[root_x] = root_y,
            std::cmp::Ordering::Greater => self.parent[root_y] = root_x,
            std::cmp::Ordering::Equal => {
                self.parent[root_y] = root_x;
                self.rank[root_x] += 1;
            }
        }
    }

    fn clusters(&mut self) -> HashMap<usize, Vec<usize>> {
        let mut clusters: HashMap<usize, Vec<usize>> = HashMap::new();
        for i in 0..self.parent.len() {
            let root = self.find(i);
            clusters.entry(root).or_default().push(i);
        }
        clusters
    }
}

/// Compute longest common prefix (LCP) of two strings, char-level.
/// Supports Chinese, Latin, and mixed text.
fn longest_common_prefix(a: &str, b: &str) -> String {
    a.chars()
        .zip(b.chars())
        .take_while(|(ca, cb)| ca == cb)
        .map(|(c, _)| c)
        .collect()
}

/// Count characters in a string (not bytes).
fn char_count(s: &str) -> usize {
    s.chars().count()
}

/// Check if a character is Chinese (CJK Unified Ideographs).
fn is_chinese_char(c: char) -> bool {
    matches!(c, '\u{4E00}'..='\u{9FFF}')
}

/// Trim trailing whitespace and separators from a string.
fn trim_suffix(s: &str) -> String {
    s.trim_end_matches(|c: char| c.is_whitespace() || "·｜-/：　".contains(c))
        .to_string()
}

/// Outcome of a single sync pass, useful for logging / tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct SyncStats {
    pub inserted: usize,
    pub skipped_existing: usize,
}

/// Pure in-memory passes that turn `entries` into per-entity `Decision`s.
/// Implements three-layer fallback for group_id:
/// 1. Same device_id (no domain suffix) → cross-domain aggregation
/// 2. Same via_device + area → hub-based aggregation
/// 3. Same area + LCP clustering → name-based aggregation
/// 4. None of above → singleton
fn compute_decisions(entries: &[HaEntityRegistryEntry]) -> Vec<Decision> {
    let mut decisions: Vec<Decision> = entries
        .iter()
        .map(|e| Decision {
            hidden: e.default_hidden(),
            collapsed: e.default_collapsed(),
            group_id: None,
            group_primary: true,
        })
        .collect();

    // Layer 1: Device-based grouping (no domain suffix)
    let mut device_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        if let Some(device_id) = &e.device_id {
            let group_id = format!("device::{}", device_id);
            decisions[idx].group_id = Some(group_id.clone());
            device_groups.entry(group_id).or_default().push(idx);
        }
    }

    // Layer 2: Via-device grouping (hub-based, same area)
    let mut via_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        if decisions[idx].group_id.is_some() {
            continue; // Already grouped by device_id
        }
        if let (Some(via_device), Some(area)) = (&e.via_device_id, &e.area_id) {
            let group_id = format!("via::{}::{}", via_device, area);
            decisions[idx].group_id = Some(group_id.clone());
            via_groups.entry(group_id).or_default().push(idx);
        }
    }

    // Layer 3: LCP clustering per area
    let mut area_entities: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        if decisions[idx].group_id.is_some() {
            continue; // Already grouped
        }
        if let Some(area) = &e.area_id {
            area_entities.entry(area.clone()).or_default().push(idx);
        }
    }

    for (area, indices) in area_entities.iter() {
        if indices.len() < 2 {
            continue; // No clustering needed for single entity
        }

        // Build Union-Find for this area
        let mut uf = UnionFind::new(indices.len());

        // Compare all pairs for LCP
        for i in 0..indices.len() {
            for j in (i + 1)..indices.len() {
                let idx_a = indices[i];
                let idx_b = indices[j];
                let name_a = entries[idx_a].friendly_name.as_deref().unwrap_or("");
                let name_b = entries[idx_b].friendly_name.as_deref().unwrap_or("");

                if name_a.is_empty() || name_b.is_empty() {
                    continue;
                }

                let lcp = longest_common_prefix(name_a, name_b);
                let lcp_len = char_count(&lcp);
                let shorter_len = char_count(name_a).min(char_count(name_b));

                // Check threshold: LCP ≥ 50% of shorter name
                if shorter_len == 0 {
                    continue;
                }
                let ratio = (lcp_len * 100) / shorter_len;

                // Minimum length check: ≥2 Chinese chars or ≥3 Latin chars
                let min_len = if lcp.chars().any(is_chinese_char) { 2 } else { 3 };

                if lcp_len >= min_len && ratio >= 50 {
                    uf.union(i, j);
                }
            }
        }

        // Extract clusters (size ≥ 2)
        let clusters = uf.clusters();
        for (_, cluster) in clusters {
            if cluster.len() < 2 {
                continue;
            }

            // Compute base name: LCP of all members in cluster
            let mut base_name = entries[indices[cluster[0]]]
                .friendly_name
                .as_deref()
                .unwrap_or("")
                .to_string();
            for &local_idx in cluster.iter().skip(1) {
                let global_idx = indices[local_idx];
                let name = entries[global_idx].friendly_name.as_deref().unwrap_or("");
                base_name = longest_common_prefix(&base_name, name);
            }
            base_name = trim_suffix(&base_name);

            if base_name.is_empty() {
                continue;
            }

            // Generate group_id: sha1(base_name::area_id).truncate(16)
            let input = format!("{}::{}", base_name, area);
            let hash = Sha1::digest(input.as_bytes());
            let hash_hex = format!("{:x}", hash);
            let group_id = format!("name::{}", &hash_hex[..16.min(hash_hex.len())]);

            // Assign group_id to all cluster members
            for &local_idx in &cluster {
                let global_idx = indices[local_idx];
                decisions[global_idx].group_id = Some(group_id.clone());
            }

            // Add to groups for primary selection
            via_groups.insert(group_id, cluster.iter().map(|&i| indices[i]).collect());
        }
    }

    // Collect all groups for primary selection
    let mut all_groups = device_groups;
    all_groups.extend(via_groups);

    // Primary selection: within each group, pick the best entity
    for member_idxs in all_groups.values() {
        if member_idxs.len() <= 1 {
            continue;
        }
        let mut ranked = member_idxs.clone();
        ranked.sort_by_key(|&idx| entries[idx].primary_sort_key());
        // First = primary, rest = secondary
        for &idx in ranked.iter().skip(1) {
            decisions[idx].group_primary = false;
        }
    }

    decisions
}

/// Sync default visibility / grouping: insert (hidden, collapsed, group_id,
/// group_primary) for every HA entity. Uses `INSERT ... ON CONFLICT DO NOTHING`
/// to preserve user manual adjustments. Only new entities get computed defaults.
pub async fn sync_default_visibility_and_grouping(
    pool: &PgPool,
    instance_id: Uuid,
    entries: Vec<HaEntityRegistryEntry>,
) -> Result<SyncStats, AppError> {
    if entries.is_empty() {
        return Ok(SyncStats::default());
    }

    let decisions = compute_decisions(&entries);

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
            via_device_id: None,
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
    fn group_id_layer1_same_device_no_domain() {
        let mut e = entry("light.foo");
        e.device_id = Some("dev123".into());
        assert_eq!(e.compute_group_id().as_deref(), Some("device::dev123"));

        // Cross-domain: same device should group
        let mut switch = entry("switch.bar");
        switch.device_id = Some("dev123".into());
        assert_eq!(switch.compute_group_id().as_deref(), Some("device::dev123"));
    }

    #[test]
    fn group_id_none_without_device_or_via() {
        let e = entry("light.foo");
        assert!(e.compute_group_id().is_none());
    }

    #[test]
    fn from_json_extracts_device_id_and_via_device() {
        let v = json!({
            "entity_id": "light.kitchen",
            "device_id": "abc",
            "via_device_id": "hub123",
            "entity_category": null
        });
        let e = HaEntityRegistryEntry::from_json(&v).unwrap();
        assert_eq!(e.device_id.as_deref(), Some("abc"));
        assert_eq!(e.via_device_id.as_deref(), Some("hub123"));
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
    fn domain_priority_light_beats_switch() {
        let light = entry("light.a");
        let switch = entry("switch.b");
        assert!(light.domain_priority() < switch.domain_priority());
    }

    #[test]
    fn primary_election_picks_by_domain_then_features() {
        let mut light = entry("light.a");
        light.friendly_name = Some("Lamp".into());
        light.supported_features = Some(0b1); // 1 bit

        let mut switch = entry("switch.b");
        switch.friendly_name = Some("Lamp".into());
        switch.supported_features = Some(0b111); // 3 bits

        // light domain priority beats switch even with fewer features
        assert!(light.primary_sort_key() < switch.primary_sort_key());
    }

    #[test]
    fn lcp_chinese_mixed() {
        assert_eq!(
            longest_common_prefix("次卧吸顶灯 灯", "次卧吸顶灯 凌动开关"),
            "次卧吸顶灯 "
        );
        assert_eq!(
            longest_common_prefix("Living Room Light", "Living Room Switch"),
            "Living Room "
        );
        assert_eq!(longest_common_prefix("客厅灯", "客厅窗帘"), "客厅");
    }

    #[test]
    fn char_count_works_for_chinese() {
        assert_eq!(char_count("次卧吸顶灯"), 5);
        assert_eq!(char_count("abc"), 3);
        assert_eq!(char_count("次ab卧"), 4);
    }

    #[test]
    fn is_chinese_char_detection() {
        assert!(is_chinese_char('次'));
        assert!(is_chinese_char('灯'));
        assert!(!is_chinese_char('a'));
        assert!(!is_chinese_char(' '));
    }

    #[test]
    fn trim_suffix_removes_separators() {
        assert_eq!(trim_suffix("次卧吸顶灯 "), "次卧吸顶灯");
        assert_eq!(trim_suffix("客厅·"), "客厅");
        assert_eq!(trim_suffix("Living Room - "), "Living Room");
    }

    #[test]
    fn union_find_clusters_pairs() {
        let mut uf = UnionFind::new(4);
        uf.union(0, 1);
        uf.union(2, 3);
        let clusters = uf.clusters();
        assert_eq!(clusters.len(), 2);
    }

    #[test]
    fn lcp_clustering_same_area_chinese() {
        let entries = vec![
            {
                let mut e = entry("light.a");
                e.friendly_name = Some("次卧吸顶灯 灯".into());
                e.area_id = Some("bedroom".into());
                e
            },
            {
                let mut e = entry("light.b");
                e.friendly_name = Some("次卧吸顶灯 灯2".into());
                e.area_id = Some("bedroom".into());
                e
            },
            {
                let mut e = entry("switch.c");
                e.friendly_name = Some("次卧吸顶灯 凌动开关".into());
                e.area_id = Some("bedroom".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries);

        // All three should be grouped (LCP = "次卧吸顶灯", 5 chars, ≥50% threshold)
        let group_ids: Vec<_> = decisions.iter().filter_map(|d| d.group_id.as_ref()).collect();
        assert_eq!(group_ids.len(), 3);
        assert_eq!(group_ids[0], group_ids[1]);
        assert_eq!(group_ids[1], group_ids[2]);

        // light should be primary (domain priority)
        assert!(decisions[0].group_primary);
        assert!(!decisions[1].group_primary);
        assert!(!decisions[2].group_primary);
    }

    #[test]
    fn lcp_clustering_different_area_no_group() {
        let entries = vec![
            {
                let mut e = entry("light.a");
                e.friendly_name = Some("次卧吸顶灯".into());
                e.area_id = Some("bedroom".into());
                e
            },
            {
                let mut e = entry("light.b");
                e.friendly_name = Some("次卧吸顶灯2".into());
                e.area_id = Some("kitchen".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries);

        // Different areas should not group
        assert!(decisions[0].group_id.is_none());
        assert!(decisions[1].group_id.is_none());
    }

    #[test]
    fn lcp_threshold_not_met_no_group() {
        let entries = vec![
            {
                let mut e = entry("light.a");
                e.friendly_name = Some("客厅吸顶灯".into());
                e.area_id = Some("living".into());
                e
            },
            {
                let mut e = entry("cover.b");
                e.friendly_name = Some("厨房窗帘控制器".into());
                e.area_id = Some("living".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries);

        // Different prefixes (客厅 vs 厨房), should not group
        assert!(decisions[0].group_id.is_none());
        assert!(decisions[1].group_id.is_none());
    }

    #[test]
    fn via_device_grouping_same_area() {
        let entries = vec![
            {
                let mut e = entry("light.a");
                e.via_device_id = Some("hub1".into());
                e.area_id = Some("bedroom".into());
                e
            },
            {
                let mut e = entry("switch.b");
                e.via_device_id = Some("hub1".into());
                e.area_id = Some("bedroom".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries);

        // Same via_device + area should group
        assert!(decisions[0].group_id.is_some());
        assert_eq!(decisions[0].group_id, decisions[1].group_id);
        assert!(decisions[0].group_id.as_ref().unwrap().starts_with("via::hub1::"));
    }

    #[test]
    fn device_id_priority_over_via_device() {
        let entries = vec![{
            let mut e = entry("light.a");
            e.device_id = Some("dev1".into());
            e.via_device_id = Some("hub1".into());
            e.area_id = Some("bedroom".into());
            e
        }];

        let decisions = compute_decisions(&entries);

        // device_id should take priority over via_device_id
        assert!(decisions[0].group_id.as_ref().unwrap().starts_with("device::dev1"));
    }

    #[test]
    fn compute_decisions_does_not_apply_per_room_cap() {
        // 30 lights with completely different names — no LCP match, all independent
        let entries: Vec<HaEntityRegistryEntry> = vec![
            "Kitchen Ceiling",
            "Dining Table",
            "Counter Strip",
            "Pantry Bulb",
            "Island Pendant",
            "Window Spot",
            "Cabinet Under",
            "Drawer LED",
            "Stove Hood",
            "Sink Fixture",
            "Breakfast Nook",
            "Corner Lamp",
            "Entryway Sconce",
            "Hallway Runner",
            "Closet Pull",
            "Microwave Light",
            "Oven Interior",
            "Fridge Inside",
            "Dishwasher Glow",
            "Trash Sensor",
            "Toaster Indicator",
            "Coffee Maker",
            "Kettle Base",
            "Blender Ring",
            "Mixer Dial",
            "Food Processor",
            "Can Opener",
            "Wine Cooler",
            "Tea Station",
            "Spice Rack",
        ]
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let mut e = entry(&format!("light.l{i}"));
            e.area_id = Some("kitchen".into());
            e.friendly_name = Some(name.to_string());
            e
        })
        .collect();

        let decisions = compute_decisions(&entries);
        let visible = decisions.iter().filter(|d| !d.collapsed && d.group_primary).count();
        // All unique names, no clustering, all should be independent primaries
        assert_eq!(visible, 30, "all 30 lights stay visible without K-cap");
    }
}
