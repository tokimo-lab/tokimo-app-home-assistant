//! Default-presentation seal of (hidden, collapsed) onto `entity_overrides`,
//! plus M:N tile registration into `accessory_groups` / `accessory_group_members`.
//!
//! Strategy: for every HA entity we know about, compute the "default
//! presentation" fields and `INSERT ... ON CONFLICT DO NOTHING` on
//! `entity_overrides` so existing rows with user adjustments stay intact.
//!
//! Group membership is **not** stored on `entity_overrides` anymore (P8.0.1):
//! it lives in `accessory_groups` (one row per tile, keyed by `natural_key`)
//! and `accessory_group_members` (M:N, with `is_primary` and
//! `sub_function_role` per link). This decouples "is the entity hidden?" from
//! "which tiles is the entity on?" so a single entity can appear on multiple
//! tiles (e.g. a `_action` sensor promoted onto two adjacent gang switches).
//!
//! The default rules:
//!   * `hidden` — `entity_category` ∈ {`diagnostic`, `config`}.
//!   * `collapsed` — pure domain-table lookup. Actuator-like domains
//!     (`light`, `switch`, `climate`, …) default visible; read-only and
//!     trigger-style domains (`sensor`, `binary_sensor`, `automation`,
//!     `script`, `scene`, …) default collapsed. Plus a per-entity
//!     name-keyword demotion for noise switches.
//!   * Tiles (`accessory_groups`) — three-layer fallback for the
//!     `natural_key` that identifies a tile:
//!     1. Same device_id → `device::{device_id}` (no domain suffix)
//!     2. Same via_device + area → `via::{root_device_id}::{area_id}`
//!     3. Same area + LCP clustering → `name::{base_sha1}::{area_id}`
//!     4. None of above → singleton entity, **no tile** (was previously a
//!        no-membership row; now: just absent from accessory_groups).
//!   * Per-tile primary — within an accessory, the entity with the highest
//!     domain priority (light > climate > cover > media_player > fan >
//!     lock > switch > input_boolean > sensor > binary_sensor > others),
//!     then most supported_features, then shortest friendly_name wins.
//!
//! Sync ownership: this module only touches `accessory_groups.source = 'auto'`
//! rows. User-created `manual` groups (and their members) are never touched
//! by the auto sync. Auto groups whose `natural_key` no longer appears in the
//! current pass are deleted (cascading their members).

use std::collections::{HashMap, HashSet};

use regex::Regex;
use sha1::{Digest, Sha1};
use sqlx::{PgPool, Row};
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

    /// Sort key for primary selection within an accessory. Lower rank wins.
    /// Order: domain priority, then most supported_features, then shortest
    /// friendly_name, then entity_id.
    fn primary_sort_key(&self) -> (u8, i64, usize, &str) {
        primary_sort_key(
            &self.domain,
            self.supported_features.unwrap_or(0),
            self.friendly_name.as_deref(),
            &self.entity_id,
        )
    }
}

/// Domain priority for primary selection within an accessory.
/// Lower value = higher priority.
///
/// Exported for use in accessory member management endpoints (add/remove member
/// operations that need to re-elect a primary when the current one leaves).
pub fn domain_priority(domain: &str) -> u8 {
    match domain {
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
///
/// Exported for use in accessory member management endpoints.
pub fn primary_sort_key<'a>(
    domain: &str,
    supported_features: i64,
    friendly_name: Option<&'a str>,
    entity_id: &'a str,
) -> (u8, i64, usize, &'a str) {
    let priority = domain_priority(domain);
    // Negate count_ones to sort descending (more features = lower sort key)
    let features = 0 - (supported_features.count_ones() as i64);
    let name_len = friendly_name.map(|s| s.chars().count()).unwrap_or(usize::MAX);
    (priority, features, name_len, entity_id)
}

/// Per-entity decision baked at first import.
///
/// `group_ids` is the list of algorithmically derived **natural_key**s of
/// the tiles this entity belongs to. Most entities belong to a single tile
/// (single group_id), but shared sensors on multi-channel devices can belong
/// to multiple tiles (e.g. `linkquality` sensor attached to all channels).
/// Singletons (entities not joined to any tile) carry an empty `group_ids`.
struct Decision {
    hidden: bool,
    collapsed: bool,
    group_ids: Vec<String>,
    group_primary: bool,
}

#[cfg(test)]
impl Decision {
    /// Test helper: returns the first group_id if present (most entities have
    /// at most one). Don't use in production code — iterate `group_ids`.
    fn group_id(&self) -> Option<&String> {
        self.group_ids.first()
    }
}

/// Index of multi-channel devices: device_id → set of channel numbers.
/// A device is "multi-channel" if it has ≥2 different channel numbers.
#[derive(Debug, Clone)]
struct DeviceChannelIndex {
    /// device_id → Set<channel_num>
    channels: HashMap<String, HashSet<u32>>,
}

impl DeviceChannelIndex {
    fn build(entries: &[HaEntityRegistryEntry]) -> Self {
        let channel_regex = Regex::new(r"_channel_(\d+)$").unwrap();
        let mut channels: HashMap<String, HashSet<u32>> = HashMap::new();

        for entry in entries {
            if let Some(device_id) = &entry.device_id
                && let Some(captures) = channel_regex.captures(&entry.entity_id)
                && let Some(num_str) = captures.get(1)
                && let Ok(num) = num_str.as_str().parse::<u32>()
            {
                channels.entry(device_id.clone()).or_default().insert(num);
            }
        }

        Self { channels }
    }

    /// Returns true if this device has ≥2 different channels.
    fn is_multi_channel(&self, device_id: &str) -> bool {
        self.channels.get(device_id).is_some_and(|set| set.len() >= 2)
    }

    /// Extract channel number from entity_id, if any.
    fn extract_channel(entity_id: &str) -> Option<u32> {
        let channel_regex = Regex::new(r"_channel_(\d+)$").unwrap();
        channel_regex
            .captures(entity_id)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
    }

    /// Get all channel numbers for a device, sorted ascending.
    fn get_channels(&self, device_id: &str) -> Vec<u32> {
        self.channels
            .get(device_id)
            .map(|set| {
                let mut v: Vec<u32> = set.iter().copied().collect();
                v.sort();
                v
            })
            .unwrap_or_default()
    }
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

/// Auxiliary domains that should not participate in Layer-3 LCP.
///
/// These are user-level entities (automations, scripts, scenes, OTA updates)
/// rather than physical-device entities. Folding them into device tiles by
/// friendly-name prefix matching produces unhelpful merges.
fn is_aux_domain(e: &HaEntityRegistryEntry) -> bool {
    matches!(e.domain.as_str(), "automation" | "script" | "scene" | "update")
}

/// Outcome of a single sync pass, useful for logging / tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct SyncStats {
    pub inserted: usize,
    pub skipped_existing: usize,
}

/// Strip an area's display name from the start of `friendly_name`.
///
/// Also trims any leading separator (space, dash, underscore, Chinese
/// middle dot) that remains after stripping.
///
/// Used as the *comparison key* for Layer-3 LCP — the area already partitions
/// clustering, so repeating the area name in the prefix carries no
/// information and only encourages over-merging.
fn strip_area_prefix(friendly_name: &str, area_name: &str) -> String {
    if area_name.is_empty() {
        return friendly_name.to_string();
    }
    let stripped = friendly_name.strip_prefix(area_name).unwrap_or(friendly_name);
    stripped
        .trim_start_matches(|c: char| c.is_whitespace() || matches!(c, '-' | '_' | '·' | '・'))
        .to_string()
}

/// Pure in-memory passes that turn `entries` into per-entity `Decision`s.
///
/// Implements three-layer fallback for group_id:
/// 1. Same device_id (no domain suffix) → cross-domain aggregation
/// 2. Same via_device + area → hub-based aggregation
/// 3. Same area + LCP clustering (cross-group merge) → name-based aggregation
/// 4. None of above → singleton
fn compute_decisions(entries: &[HaEntityRegistryEntry], area_names: &HashMap<String, String>) -> Vec<Decision> {
    // Phase 0: Build device-channel index
    let channel_index = DeviceChannelIndex::build(entries);

    let mut decisions: Vec<Decision> = entries
        .iter()
        .map(|e| Decision {
            hidden: e.default_hidden(),
            collapsed: e.default_collapsed(),
            group_ids: Vec::new(),
            group_primary: true,
        })
        .collect();

    // Layer 1: Device-based grouping with channel splitting
    let mut device_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        if let Some(device_id) = &e.device_id {
            if channel_index.is_multi_channel(device_id) {
                // Multi-channel device: split by channel
                if let Some(ch_num) = DeviceChannelIndex::extract_channel(&e.entity_id) {
                    // Entity has channel suffix → goes to single channel group
                    let group_id = format!("device::{}::ch{}", device_id, ch_num);
                    decisions[idx].group_ids.push(group_id.clone());
                    device_groups.entry(group_id).or_default().push(idx);
                } else {
                    // Shared sensor (no channel suffix) → attach to ALL channels
                    let channels = channel_index.get_channels(device_id);
                    for ch_num in channels {
                        let group_id = format!("device::{}::ch{}", device_id, ch_num);
                        decisions[idx].group_ids.push(group_id.clone());
                        device_groups.entry(group_id).or_default().push(idx);
                    }
                }
            } else {
                // Single-channel or non-channel device: original logic
                let group_id = format!("device::{}", device_id);
                decisions[idx].group_ids.push(group_id.clone());
                device_groups.entry(group_id).or_default().push(idx);
            }
        }
    }

    // Layer 2: Via-device grouping (hub-based, same area)
    let mut via_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, e) in entries.iter().enumerate() {
        if !decisions[idx].group_ids.is_empty() {
            continue; // Already grouped by device_id
        }
        if let (Some(via_device), Some(area)) = (&e.via_device_id, &e.area_id) {
            let group_id = format!("via::{}::{}", via_device, area);
            decisions[idx].group_ids.push(group_id.clone());
            via_groups.entry(group_id).or_default().push(idx);
        }
    }

    // Collect all Layer-1 and Layer-2 groups for interim primary selection
    let mut all_groups = device_groups.clone();
    all_groups.extend(via_groups.clone());

    // Interim primary selection: within each Layer-1/2 group, pick the best entity
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

    // ----------------------------------------------------------------
    // Layer 3 (P8.2 redesign): three-phase LCP clustering.
    //
    // Phase 3a — Device-level LCP (per area, stricter 60% ratio):
    //   Cross-DEVICE merge only. Picks one representative friendly_name per
    //   non-multi-channel device, runs Union-Find on those reps within each
    //   area. Catches the legitimate "same physical device exposed via two
    //   HA integration paths" case (different device_ids, identical names).
    //   Multi-channel-split devices (`device::xxx::chN`) are excluded so L1
    //   sub-device splits are never clobbered.
    //
    // Phase 3b — Orphan + Phase-3a-cluster LCP (50% ratio):
    //   Candidates are entities with no device_id (template sensors, scripted
    //   entities — the "orphans") plus one rep per Phase-3a cluster. Lets
    //   orphans attach to existing device clusters when their friendly_name
    //   shares a long prefix, and lets unrelated orphans cluster among
    //   themselves. Single-device groups (Phase-1 device:: groups that did
    //   not participate in any Phase-3a cluster) are intentionally excluded
    //   — that's how cross-device over-merge (e.g. yeelight 餐桌灯 vs Aqara
    //   餐桌灯开关 channels) is prevented.
    //
    // Phase 3c — Cluster secondary merge (per area, base-name cross-LCP):
    //   For LCP groups in the same area, if their base_names share ≥2 chars
    //   of cross-LCP, union them. Fixes transitive-union failures like the
    //   客厅空调 5-sensor split into {电流,电能表,电压} + {功率,功率因素}.
    //
    // Auxiliary domains (automation/script/scene/update) are excluded from
    // LCP candidacy in both Phase 3a and Phase 3b.
    // ----------------------------------------------------------------

    // (gid, base_name, area) for every name:: cluster emitted by 3a/3b.
    // Used by Phase 3c. Each unique gid is appended at most once.
    let mut emitted: Vec<(String, String, String)> = Vec::new();

    // ----- Phase 3a: device-level LCP -----
    struct DeviceRep {
        comparison_key: String, // friendly_name after area prefix strip
        member_entity_idxs: Vec<usize>,
    }

    let mut device_reps_per_area: HashMap<String, Vec<DeviceRep>> = HashMap::new();
    for (group_id, member_idxs) in &device_groups {
        if member_idxs.is_empty() {
            continue;
        }
        // Skip channel-split groups: their entities live in `device::xxx::chN`
        // and must not participate in cross-device LCP.
        if group_id.contains("::ch") {
            continue;
        }
        if !group_id.starts_with("device::") {
            continue;
        }

        // Pick best representative entity (skip aux domains, prefer primary
        // by domain priority etc).
        let rep_idx = member_idxs
            .iter()
            .filter(|&&i| !is_aux_domain(&entries[i]))
            .filter(|&&i| entries[i].friendly_name.is_some() && entries[i].area_id.is_some())
            .min_by_key(|&&i| entries[i].primary_sort_key())
            .copied();
        let Some(rep_idx) = rep_idx else { continue };
        let e = &entries[rep_idx];
        let area = match &e.area_id {
            Some(a) => a.clone(),
            None => continue,
        };
        let name = match &e.friendly_name {
            Some(n) if !n.is_empty() => n.clone(),
            _ => continue,
        };
        let area_name = area_names.get(&area).map(String::as_str).unwrap_or("");
        let comparison_key = strip_area_prefix(&name, area_name);
        if comparison_key.is_empty() {
            continue;
        }

        device_reps_per_area.entry(area).or_default().push(DeviceRep {
            comparison_key,
            member_entity_idxs: member_idxs.clone(),
        });
    }

    // For each Phase-3a-emitted gid, a representative comparison_key (we use
    // the cluster's base_name) so Phase 3b can pairwise-compare against it.
    // Stored alongside `emitted` and re-used in Phase 3b candidate construction.

    for (area, reps) in &device_reps_per_area {
        if reps.len() < 2 {
            continue;
        }
        let mut uf = UnionFind::new(reps.len());
        for i in 0..reps.len() {
            for j in (i + 1)..reps.len() {
                let a = &reps[i].comparison_key;
                let b = &reps[j].comparison_key;
                let lcp = longest_common_prefix(a, b);
                let lcp_len = char_count(&lcp);
                let shorter = char_count(a).min(char_count(b));
                if shorter == 0 {
                    continue;
                }
                let ratio = (lcp_len * 100) / shorter;
                // Phase-3a stricter: 3 chars + 60% ratio.
                if lcp_len >= 3 && ratio >= 60 {
                    uf.union(i, j);
                }
            }
        }

        for (_, cluster) in uf.clusters() {
            if cluster.len() < 2 {
                continue;
            }
            let mut base_name = reps[cluster[0]].comparison_key.clone();
            for &li in cluster.iter().skip(1) {
                base_name = longest_common_prefix(&base_name, &reps[li].comparison_key);
            }
            base_name = trim_suffix(&base_name);
            if base_name.is_empty() {
                continue;
            }
            let chinese = base_name.chars().filter(|c| is_chinese_char(*c)).count();
            let total = base_name.chars().count();
            if chinese < 3 && total < 5 {
                continue;
            }

            let input = format!("{}::{}", base_name, area);
            let hash = Sha1::digest(input.as_bytes());
            let hash_hex = format!("{:x}", hash);
            let new_group_id = format!("name::{}", &hash_hex[..16.min(hash_hex.len())]);

            for &li in &cluster {
                for &eidx in &reps[li].member_entity_idxs {
                    decisions[eidx].group_ids.clear();
                    decisions[eidx].group_ids.push(new_group_id.clone());
                }
            }
            emitted.push((new_group_id, base_name, area.clone()));
        }
    }

    // ----- Phase 3b: orphan + Phase-3a-cluster LCP -----
    enum P3bCand {
        // An entity with no device_id.
        Orphan { entity_idx: usize },
        // A Phase-3a cluster, identified by its name:: group_id. All
        // entities currently mapped to this gid will be re-pointed if the
        // cluster is unioned into a different canonical gid.
        LcpCluster { gid: String },
    }

    let mut p3b_per_area: HashMap<String, Vec<(P3bCand, String /* comparison_key */)>> = HashMap::new();

    // Phase-3a clusters as fixed candidates.
    for (gid, base, area) in &emitted {
        p3b_per_area
            .entry(area.clone())
            .or_default()
            .push((P3bCand::LcpCluster { gid: gid.clone() }, base.clone()));
    }

    // Orphan entities (no device_id, not aux, has area + friendly_name).
    for (idx, e) in entries.iter().enumerate() {
        if e.device_id.is_some() {
            continue;
        }
        if !decisions[idx].group_ids.is_empty() {
            continue;
        }
        if is_aux_domain(e) {
            continue;
        }
        let Some(area) = e.area_id.as_ref() else { continue };
        let Some(name) = e.friendly_name.as_ref() else { continue };
        if name.is_empty() {
            continue;
        }
        let area_name = area_names.get(area).map(String::as_str).unwrap_or("");
        let key = strip_area_prefix(name, area_name);
        if key.is_empty() {
            continue;
        }
        p3b_per_area
            .entry(area.clone())
            .or_default()
            .push((P3bCand::Orphan { entity_idx: idx }, key));
    }

    for (area, cands) in &p3b_per_area {
        if cands.len() < 2 {
            continue;
        }
        let mut uf = UnionFind::new(cands.len());
        for i in 0..cands.len() {
            for j in (i + 1)..cands.len() {
                let a = &cands[i].1;
                let b = &cands[j].1;
                let lcp = longest_common_prefix(a, b);
                let lcp_len = char_count(&lcp);
                let shorter = char_count(a).min(char_count(b));
                if shorter == 0 {
                    continue;
                }
                let ratio = (lcp_len * 100) / shorter;
                if lcp_len >= 3 && ratio >= 50 {
                    uf.union(i, j);
                }
            }
        }

        for (_, cluster) in uf.clusters() {
            if cluster.len() < 2 {
                continue;
            }
            let mut base_name = cands[cluster[0]].1.clone();
            for &li in cluster.iter().skip(1) {
                base_name = longest_common_prefix(&base_name, &cands[li].1);
            }
            base_name = trim_suffix(&base_name);
            if base_name.is_empty() {
                continue;
            }
            let chinese = base_name.chars().filter(|c| is_chinese_char(*c)).count();
            let total = base_name.chars().count();
            if chinese < 3 && total < 5 {
                continue;
            }

            // Canonical group_id: prefer an existing Phase-3a gid in this
            // cluster (so orphans attach to the device cluster). If multiple
            // Phase-3a gids ended up in the same Phase-3b cluster, we pick
            // the first and re-point the rest.
            let existing_gids: Vec<String> = cluster
                .iter()
                .filter_map(|&li| match &cands[li].0 {
                    P3bCand::LcpCluster { gid } => Some(gid.clone()),
                    _ => None,
                })
                .collect();

            let canonical_gid = if let Some(g) = existing_gids.first() {
                g.clone()
            } else {
                let input = format!("{}::{}", base_name, area);
                let hash = Sha1::digest(input.as_bytes());
                let hash_hex = format!("{:x}", hash);
                let g = format!("name::{}", &hash_hex[..16.min(hash_hex.len())]);
                emitted.push((g.clone(), base_name.clone(), area.clone()));
                g
            };

            // Re-point entities for non-canonical Phase-3a gids in this cluster.
            let to_repoint: Vec<String> = existing_gids.iter().filter(|g| **g != canonical_gid).cloned().collect();
            if !to_repoint.is_empty() {
                let to_repoint_set: HashSet<String> = to_repoint.into_iter().collect();
                for d in decisions.iter_mut() {
                    for g in d.group_ids.iter_mut() {
                        if to_repoint_set.contains(g) {
                            *g = canonical_gid.clone();
                        }
                    }
                }
            }

            // Assign orphans to canonical gid.
            for &li in &cluster {
                if let P3bCand::Orphan { entity_idx } = &cands[li].0 {
                    decisions[*entity_idx].group_ids.clear();
                    decisions[*entity_idx].group_ids.push(canonical_gid.clone());
                }
            }
        }
    }

    // ----- Phase 3c: cluster secondary merge (per area, cross-LCP of base_names) -----
    // De-duplicate emitted by gid (Phase 3a/3b never emit duplicate gids,
    // but be defensive).
    let mut emitted_by_area: HashMap<String, Vec<(String, String)>> = HashMap::new();
    {
        let mut seen: HashSet<String> = HashSet::new();
        for (gid, base, area) in &emitted {
            if seen.insert(gid.clone()) {
                emitted_by_area
                    .entry(area.clone())
                    .or_default()
                    .push((gid.clone(), base.clone()));
            }
        }
    }

    let mut canonical_map: HashMap<String, String> = HashMap::new();
    for groups in emitted_by_area.values() {
        if groups.len() < 2 {
            continue;
        }
        let mut uf = UnionFind::new(groups.len());
        for i in 0..groups.len() {
            for j in (i + 1)..groups.len() {
                let cross = longest_common_prefix(&groups[i].1, &groups[j].1);
                let cross = trim_suffix(&cross);
                let chinese = cross.chars().filter(|c| is_chinese_char(*c)).count();
                let total = char_count(&cross);
                // ≥2 chars cross-LCP, biased toward Chinese (≥2 CJK chars
                // is a meaningful concept like "空调"). Pure-ASCII clusters
                // need ≥3 chars to avoid spurious 2-letter overlaps.
                if total >= 2 && (chinese >= 2 || total >= 3) {
                    uf.union(i, j);
                }
            }
        }
        for (_, cluster) in uf.clusters() {
            if cluster.len() < 2 {
                continue;
            }
            let canonical = groups[cluster[0]].0.clone();
            for &li in cluster.iter().skip(1) {
                canonical_map.insert(groups[li].0.clone(), canonical.clone());
            }
        }
    }

    if !canonical_map.is_empty() {
        for d in decisions.iter_mut() {
            for g in d.group_ids.iter_mut() {
                if let Some(canon) = canonical_map.get(g) {
                    *g = canon.clone();
                }
            }
        }
    }

    // Final primary selection: rebuild groups from current decisions and re-elect primaries
    let mut final_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, decision) in decisions.iter().enumerate() {
        for group_id in &decision.group_ids {
            final_groups.entry(group_id.clone()).or_default().push(idx);
        }
    }

    // Reset all group_primary to true (for singletons)
    for decision in &mut decisions {
        decision.group_primary = true;
    }

    // Re-elect primary for each final group
    for member_idxs in final_groups.values() {
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

/// Sync default visibility into `entity_overrides` AND tile membership into
/// `accessory_groups` + `accessory_group_members` (M:N).
///
/// Idempotent: re-running with the same inputs produces the same DB state.
/// `entity_overrides` rows use `INSERT ... ON CONFLICT DO NOTHING` to
/// preserve any user adjustments. Tiles are upserted by `(instance_id,
/// natural_key)` so existing tile UUIDs survive across syncs.
///
/// Auto groups whose `natural_key` no longer appears (because their member
/// devices were removed from HA, etc.) are deleted; manual groups are never
/// touched.
pub async fn sync_default_visibility_and_grouping(
    pool: &PgPool,
    instance_id: Uuid,
    entries: Vec<HaEntityRegistryEntry>,
    area_names: &HashMap<String, String>,
) -> Result<SyncStats, AppError> {
    if entries.is_empty() {
        return Ok(SyncStats::default());
    }

    let decisions = compute_decisions(&entries, area_names);

    let mut tx = pool.begin().await?;
    let mut inserted = 0usize;
    let mut skipped = 0usize;

    // Pass A: upsert per-entity overrides (DO NOTHING preserves user state).
    for (e, d) in entries.iter().zip(decisions.iter()) {
        let res = sqlx::query(
            "INSERT INTO entity_overrides ( \
                instance_id, entity_id, hidden, entity_category, collapsed \
             ) VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (instance_id, entity_id) DO NOTHING",
        )
        .bind(instance_id)
        .bind(&e.entity_id)
        .bind(d.hidden)
        .bind(e.entity_category.as_deref())
        .bind(d.collapsed)
        .execute(&mut *tx)
        .await?;

        if res.rows_affected() == 1 {
            inserted += 1;
        } else {
            skipped += 1;
        }
    }

    // Pass B: collect per-tile groupings. Group natural_keys → list of
    // (entity_id, is_primary, sort_order). Singletons (no group_ids) skipped.
    // Entities with multiple group_ids will appear in multiple tiles.
    #[derive(Clone)]
    struct PlannedMember {
        entity_id: String,
        is_primary: bool,
        sort_order: i32,
    }
    let mut planned: HashMap<String, Vec<PlannedMember>> = HashMap::new();
    for (e, d) in entries.iter().zip(decisions.iter()) {
        for natural_key in &d.group_ids {
            let bucket = planned.entry(natural_key.clone()).or_default();
            let sort_order = bucket.len() as i32;
            bucket.push(PlannedMember {
                entity_id: e.entity_id.clone(),
                is_primary: d.group_primary,
                sort_order,
            });
        }
    }

    // Pass C: UPSERT auto accessory_groups by natural_key. Capture the
    // returning UUID so we can replace members in pass D.
    let mut natural_to_id: HashMap<String, Uuid> = HashMap::new();
    for natural_key in planned.keys() {
        let row = sqlx::query(
            "INSERT INTO accessory_groups (instance_id, natural_key, source) \
             VALUES ($1, $2, 'auto') \
             ON CONFLICT (instance_id, natural_key) DO UPDATE SET \
                updated_at = NOW() \
             RETURNING id",
        )
        .bind(instance_id)
        .bind(natural_key)
        .fetch_one(&mut *tx)
        .await?;
        let gid: Uuid = row.get("id");
        natural_to_id.insert(natural_key.clone(), gid);
    }

    // Pass D: collect ids of auto groups for this instance (BEFORE the
    // delete-stale step so we know what existed). We replace the member
    // list of every auto group we just upserted, then delete any auto
    // group whose natural_key wasn't in this pass.
    let auto_group_ids: Vec<Uuid> = natural_to_id.values().copied().collect();

    // Wipe existing members of every auto group we know about, then re-insert
    // the planned set. `accessory_group_members.group_id` has ON DELETE
    // CASCADE only on the group row, not on the member row, so we DELETE
    // explicitly. Manual groups are not in `auto_group_ids` and are skipped.
    if !auto_group_ids.is_empty() {
        sqlx::query("DELETE FROM accessory_group_members WHERE group_id = ANY($1)")
            .bind(&auto_group_ids)
            .execute(&mut *tx)
            .await?;
    }

    // Insert new auto memberships. Demote-then-promote ordering inside
    // a single tile is unnecessary because we just wiped — there are no
    // pre-existing primaries to clash with the partial unique index.
    for (natural_key, members) in &planned {
        let gid = natural_to_id[natural_key];
        for m in members {
            sqlx::query(
                "INSERT INTO accessory_group_members \
                    (group_id, entity_id, instance_id, is_primary, sub_function_role, sort_order) \
                 VALUES ($1, $2, $3, $4, NULL, $5)",
            )
            .bind(gid)
            .bind(&m.entity_id)
            .bind(instance_id)
            .bind(m.is_primary)
            .bind(m.sort_order)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Pass E: delete stale auto groups (auto groups for this instance whose
    // natural_key no longer exists). Manual groups are filtered out by
    // `source = 'auto'`. Cascade clears their (already-empty) member rows.
    let live_keys: Vec<String> = planned.keys().cloned().collect();
    sqlx::query(
        "DELETE FROM accessory_groups \
          WHERE instance_id = $1 \
            AND source = 'auto' \
            AND NOT (natural_key = ANY($2))",
    )
    .bind(instance_id)
    .bind(&live_keys)
    .execute(&mut *tx)
    .await?;

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
        assert!(domain_priority(&light.domain) < domain_priority(&switch.domain));
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

        let decisions = compute_decisions(&entries, &HashMap::new());

        // All three should be grouped (LCP = "次卧吸顶灯", 5 chars, ≥50% threshold)
        let group_ids: Vec<_> = decisions.iter().filter_map(|d| d.group_id()).collect();
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

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Different areas should not group
        assert!(decisions[0].group_ids.is_empty());
        assert!(decisions[1].group_ids.is_empty());
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

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Different prefixes (客厅 vs 厨房), should not group
        assert!(decisions[0].group_ids.is_empty());
        assert!(decisions[1].group_ids.is_empty());
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

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Same via_device + area should group
        assert!(!decisions[0].group_ids.is_empty());
        assert_eq!(decisions[0].group_ids, decisions[1].group_ids);
        assert!(decisions[0].group_id().unwrap().starts_with("via::hub1::"));
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

        let decisions = compute_decisions(&entries, &HashMap::new());

        // device_id should take priority over via_device_id
        assert!(decisions[0].group_id().unwrap().starts_with("device::dev1"));
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

        let decisions = compute_decisions(&entries, &HashMap::new());
        let visible = decisions.iter().filter(|d| !d.collapsed && d.group_primary).count();
        // All unique names, no clustering, all should be independent primaries
        assert_eq!(visible, 30, "all 30 lights stay visible without K-cap");
    }

    #[test]
    fn test_cross_device_same_name_merges() {
        // User's real case: 3 different integrations for the same physical light
        // Each integration creates a separate device_id, but all have same area + friendly_name
        let entries = vec![
            // Yeelight local integration (device + light entity)
            {
                let mut e = entry("light.yeelight_ceiling");
                e.device_id = Some("yeelight_dev1".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 灯".into());
                e
            },
            {
                let mut e = entry("sensor.yeelight_power");
                e.device_id = Some("yeelight_dev1".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 功率".into());
                e
            },
            // MiHome local integration (device + light entity)
            {
                let mut e = entry("light.mihome_ceiling");
                e.device_id = Some("mihome_dev2".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 灯".into());
                e
            },
            {
                let mut e = entry("button.mihome_identify");
                e.device_id = Some("mihome_dev2".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 识别".into());
                e
            },
            // MiHome cloud integration (device + light entity)
            {
                let mut e = entry("light.micloud_ceiling");
                e.device_id = Some("micloud_dev3".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 灯".into());
                e
            },
            {
                let mut e = entry("sensor.micloud_brightness");
                e.device_id = Some("micloud_dev3".into());
                e.area_id = Some("bedroom2".into());
                e.friendly_name = Some("次卧吸顶灯 亮度".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // All 6 entities should be merged into one group via Layer-3 LCP
        let group_ids: Vec<_> = decisions.iter().filter_map(|d| d.group_id()).collect();
        assert_eq!(group_ids.len(), 6, "all entities should have a group");
        assert!(
            group_ids.windows(2).all(|w| w[0] == w[1]),
            "all should be in the same group"
        );
        assert!(
            group_ids[0].starts_with("name::"),
            "should be name-based merge, got: {}",
            group_ids[0]
        );

        // Only one primary (should be a light entity based on domain priority)
        let primaries: Vec<usize> = decisions
            .iter()
            .enumerate()
            .filter(|(_, d)| d.group_primary)
            .map(|(i, _)| i)
            .collect();
        assert_eq!(primaries.len(), 1, "only one primary");
        assert!(
            entries[primaries[0]].domain == "light",
            "primary should be a light entity"
        );
    }

    #[test]
    fn test_singletons_still_cluster() {
        // Entities without device_id but with same area + LCP should still cluster.
        // Need ≥3 Chinese chars of shared prefix under the new threshold.
        let entries = vec![
            {
                let mut e = entry("light.living_spot1");
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅射灯1".into());
                e
            },
            {
                let mut e = entry("light.living_spot2");
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅射灯2".into());
                e
            },
            {
                let mut e = entry("light.living_spot3");
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅射灯3".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // All three should cluster (LCP = "客厅射灯", 4 Chinese chars ≥ threshold)
        assert!(!decisions[0].group_ids.is_empty());
        assert_eq!(decisions[0].group_ids, decisions[1].group_ids);
        assert_eq!(decisions[0].group_ids, decisions[2].group_ids);
        assert!(decisions[0].group_id().unwrap().starts_with("name::"));
    }

    #[test]
    fn test_partial_match_merges_groups_partially() {
        // Mix of device groups and singletons with overlapping names
        let entries = vec![
            // Device group 1: "次卧灯" cluster
            {
                let mut e = entry("light.dev1_main");
                e.device_id = Some("dev1".into());
                e.area_id = Some("bedroom".into());
                e.friendly_name = Some("次卧灯 主灯".into());
                e
            },
            {
                let mut e = entry("switch.dev1_switch");
                e.device_id = Some("dev1".into());
                e.area_id = Some("bedroom".into());
                e.friendly_name = Some("次卧灯 开关".into());
                e
            },
            // Device group 2: "次卧灯" cluster
            {
                let mut e = entry("light.dev2_spot");
                e.device_id = Some("dev2".into());
                e.area_id = Some("bedroom".into());
                e.friendly_name = Some("次卧灯 射灯".into());
                e
            },
            // Singleton: "次卧灯" cluster
            {
                let mut e = entry("light.singleton");
                e.area_id = Some("bedroom".into());
                e.friendly_name = Some("次卧灯 台灯".into());
                e
            },
            // Unrelated singleton in same area (different prefix to avoid clustering)
            {
                let mut e = entry("cover.curtain");
                e.area_id = Some("bedroom".into());
                e.friendly_name = Some("主卧窗帘".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // First 4 entities should merge (3 device-grouped + 1 singleton, all "次卧灯")
        assert!(!decisions[0].group_ids.is_empty());
        assert_eq!(decisions[0].group_ids, decisions[1].group_ids);
        assert_eq!(decisions[0].group_ids, decisions[2].group_ids);
        assert_eq!(decisions[0].group_ids, decisions[3].group_ids);
        assert!(
            decisions[0].group_id().unwrap().starts_with("name::"),
            "should be name-based merge"
        );

        // Last entity ("主卧窗帘") should not merge with "次卧灯" cluster
        assert_ne!(decisions[0].group_ids, decisions[4].group_ids);

        // Only one primary across all merged entities
        let primaries: Vec<usize> = decisions
            .iter()
            .enumerate()
            .take(4) // First 4 entities
            .filter(|(_, d)| d.group_primary)
            .map(|(i, _)| i)
            .collect();
        assert_eq!(primaries.len(), 1, "only one primary in merged group");
    }

    #[test]
    fn compute_decisions_does_not_over_merge_via_area_prefix() {
        // Real-world reproduction: multiple devices in the same area whose
        // friendly_names all start with the area's display name. Without
        // area-prefix stripping, all three would transitively union via
        // the shared "主卧" prefix. With stripping, only the two ceiling
        // lights (sharing "吸顶灯") cluster; the bedside lamp stays alone.
        let mut area_names = HashMap::new();
        area_names.insert("main_bedroom".to_string(), "主卧".to_string());

        let entries = vec![
            {
                let mut e = entry("light.x");
                e.device_id = Some("device_X".into());
                e.area_id = Some("main_bedroom".into());
                e.friendly_name = Some("主卧吸顶灯1".into());
                e
            },
            {
                let mut e = entry("light.y");
                e.device_id = Some("device_Y".into());
                e.area_id = Some("main_bedroom".into());
                e.friendly_name = Some("主卧吸顶灯2".into());
                e
            },
            {
                let mut e = entry("light.z");
                e.device_id = Some("device_Z".into());
                e.area_id = Some("main_bedroom".into());
                e.friendly_name = Some("主卧床头灯".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &area_names);

        // X and Y → cluster on stripped LCP "吸顶灯" (3 Chinese chars ✓)
        let g_x = decisions[0].group_id().expect("X has group");
        let g_y = decisions[1].group_id().expect("Y has group");
        assert_eq!(g_x, g_y, "X and Y should cluster on '吸顶灯'");
        assert!(g_x.starts_with("name::"), "should be name-cluster, got {g_x}");

        // Z (床头灯) shares only "" with the cluster after stripping
        // (or "灯" = 1 char, well below threshold) — must NOT merge in.
        // Its only group is its own Layer-1 device::device_Z.
        let g_z = decisions[2].group_id().expect("Z still has Layer-1 device group");
        assert_ne!(g_x, g_z, "Z must not transitively merge into the X/Y cluster");
        assert!(
            g_z.starts_with("device::device_Z"),
            "Z keeps its Layer-1 group, got {g_z}"
        );
    }

    #[test]
    fn compute_decisions_rejects_generic_only_cluster() {
        // After stripping the area prefix "主卧", the comparison_keys are
        // "A" and "B" — they share NO prefix (and even if they did, the
        // post-cluster safety net would reject any base_name shorter
        // than 3 Chinese / 5 Latin chars). Result: no name-cluster.
        let mut area_names = HashMap::new();
        area_names.insert("x".to_string(), "主卧".to_string());

        let entries = vec![
            {
                let mut e = entry("light.a");
                e.area_id = Some("x".into());
                e.friendly_name = Some("主卧A".into());
                e
            },
            {
                let mut e = entry("light.b");
                e.area_id = Some("x".into());
                e.friendly_name = Some("主卧B".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &area_names);

        assert!(decisions[0].group_ids.is_empty(), "no Layer-3 group expected");
        assert!(decisions[1].group_ids.is_empty(), "no Layer-3 group expected");
    }

    #[test]
    fn strip_area_prefix_handles_separators() {
        assert_eq!(strip_area_prefix("主卧吸顶灯", "主卧"), "吸顶灯");
        assert_eq!(strip_area_prefix("主卧 吸顶灯", "主卧"), "吸顶灯");
        assert_eq!(strip_area_prefix("主卧-吸顶灯", "主卧"), "吸顶灯");
        assert_eq!(strip_area_prefix("主卧·吸顶灯", "主卧"), "吸顶灯");
        // No prefix match → unchanged
        assert_eq!(strip_area_prefix("客厅吸顶灯", "主卧"), "客厅吸顶灯");
        // Empty area_name → identity
        assert_eq!(strip_area_prefix("anything", ""), "anything");
        // Stripping leaves nothing
        assert_eq!(strip_area_prefix("主卧", "主卧"), "");
    }

    // ---------------- DB-backed tests (sqlx::test) ----------------

    fn ent_with_dev(eid: &str, dev: &str, area: &str, name: &str) -> HaEntityRegistryEntry {
        let mut e = entry(eid);
        e.device_id = Some(dev.into());
        e.area_id = Some(area.into());
        e.friendly_name = Some(name.into());
        e
    }

    #[sqlx::test]
    async fn m_n_membership_allows_entity_in_multiple_groups(pool: PgPool) {
        // Manually create two manual tiles and add the same entity to both.
        let inst = Uuid::new_v4();
        // Create instance first (FK required by all tables).
        sqlx::query("INSERT INTO instances (id, base_url, access_token) VALUES ($1, 'http://test', 'token')")
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();
        // entity_overrides FK requires the row exists first.
        sqlx::query(
            "INSERT INTO entity_overrides (instance_id, entity_id, hidden, collapsed) \
             VALUES ($1, 'sensor.shared', false, false)",
        )
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();

        let g1 = Uuid::new_v4();
        let g2 = Uuid::new_v4();
        for (gid, key) in [(g1, "manual::a"), (g2, "manual::b")] {
            sqlx::query(
                "INSERT INTO accessory_groups (id, instance_id, natural_key, source) \
                 VALUES ($1, $2, $3, 'manual')",
            )
            .bind(gid)
            .bind(inst)
            .bind(key)
            .execute(&pool)
            .await
            .unwrap();

            sqlx::query(
                "INSERT INTO accessory_group_members \
                    (group_id, entity_id, instance_id, is_primary) \
                 VALUES ($1, 'sensor.shared', $2, true)",
            )
            .bind(gid)
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();
        }

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM accessory_group_members WHERE entity_id = 'sensor.shared'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 2, "entity must be member of two distinct tiles");
    }

    #[sqlx::test]
    async fn partial_unique_one_primary_per_group(pool: PgPool) {
        let inst = Uuid::new_v4();
        // Create instance first (FK required by all tables).
        sqlx::query("INSERT INTO instances (id, base_url, access_token) VALUES ($1, 'http://test', 'token')")
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();
        let gid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO accessory_groups (id, instance_id, natural_key, source) \
             VALUES ($1, $2, 'manual::x', 'manual')",
        )
        .bind(gid)
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();

        for eid in ["sensor.a", "sensor.b"] {
            sqlx::query(
                "INSERT INTO entity_overrides (instance_id, entity_id, hidden, collapsed) \
                 VALUES ($1, $2, false, false)",
            )
            .bind(inst)
            .bind(eid)
            .execute(&pool)
            .await
            .unwrap();
        }

        sqlx::query(
            "INSERT INTO accessory_group_members \
                (group_id, entity_id, instance_id, is_primary) \
             VALUES ($1, 'sensor.a', $2, true)",
        )
        .bind(gid)
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();

        // Inserting a SECOND primary in the same group must fail (partial
        // unique index `accessory_group_members_one_primary_idx`).
        let dup = sqlx::query(
            "INSERT INTO accessory_group_members \
                (group_id, entity_id, instance_id, is_primary) \
             VALUES ($1, 'sensor.b', $2, true)",
        )
        .bind(gid)
        .bind(inst)
        .execute(&pool)
        .await;
        assert!(dup.is_err(), "second primary in same group must violate partial unique");
    }

    #[sqlx::test]
    async fn sync_idempotent_natural_key_upsert(pool: PgPool) {
        let inst = Uuid::new_v4();
        // Create instance first (FK required by sync function).
        sqlx::query("INSERT INTO instances (id, base_url, access_token) VALUES ($1, 'http://test', 'token')")
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();
        let entries = vec![
            ent_with_dev("light.a", "dev1", "bedroom", "lamp"),
            ent_with_dev("switch.a", "dev1", "bedroom", "switch"),
        ];

        sync_default_visibility_and_grouping(&pool, inst, entries.clone(), &HashMap::new())
            .await
            .unwrap();
        let id1: (Uuid,) =
            sqlx::query_as("SELECT id FROM accessory_groups WHERE instance_id = $1 AND natural_key = 'device::dev1'")
                .bind(inst)
                .fetch_one(&pool)
                .await
                .unwrap();

        // Run again — UUID must not change (UPSERT preserves id).
        sync_default_visibility_and_grouping(&pool, inst, entries, &HashMap::new())
            .await
            .unwrap();
        let id2: (Uuid,) =
            sqlx::query_as("SELECT id FROM accessory_groups WHERE instance_id = $1 AND natural_key = 'device::dev1'")
                .bind(inst)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(id1.0, id2.0, "natural_key UPSERT must preserve UUID");

        let cnt: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accessory_group_members WHERE group_id = $1")
            .bind(id1.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(cnt.0, 2, "members re-inserted to current count, not duplicated");
    }

    #[sqlx::test]
    async fn sync_keeps_manual_groups(pool: PgPool) {
        let inst = Uuid::new_v4();
        // Create instance first (FK required by all tables).
        sqlx::query("INSERT INTO instances (id, base_url, access_token) VALUES ($1, 'http://test', 'token')")
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();
        // Pre-existing manual group + member.
        let manual_gid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO accessory_groups (id, instance_id, natural_key, source) \
             VALUES ($1, $2, 'manual::keep', 'manual')",
        )
        .bind(manual_gid)
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO entity_overrides (instance_id, entity_id, hidden, collapsed) \
             VALUES ($1, 'sensor.manual_member', false, false)",
        )
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO accessory_group_members \
                (group_id, entity_id, instance_id, is_primary) \
             VALUES ($1, 'sensor.manual_member', $2, true)",
        )
        .bind(manual_gid)
        .bind(inst)
        .execute(&pool)
        .await
        .unwrap();

        // Run sync with totally unrelated auto entries.
        let entries = vec![
            ent_with_dev("light.x", "devX", "kitchen", "ceiling"),
            ent_with_dev("switch.x", "devX", "kitchen", "switch"),
        ];
        sync_default_visibility_and_grouping(&pool, inst, entries, &HashMap::new())
            .await
            .unwrap();

        let still_there: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM accessory_groups WHERE id = $1 AND source = 'manual'")
                .bind(manual_gid)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(still_there.0, 1, "manual group must survive auto sync");

        let member_cnt: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accessory_group_members WHERE group_id = $1")
            .bind(manual_gid)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(member_cnt.0, 1, "manual group members untouched");
    }

    #[sqlx::test]
    async fn sync_deletes_stale_auto_groups(pool: PgPool) {
        let inst = Uuid::new_v4();
        // Create instance first (FK required by sync function).
        sqlx::query("INSERT INTO instances (id, base_url, access_token) VALUES ($1, 'http://test', 'token')")
            .bind(inst)
            .execute(&pool)
            .await
            .unwrap();

        // First sync: dev1 + dev2 exist.
        let initial = vec![
            ent_with_dev("light.a", "dev1", "br", "lamp1"),
            ent_with_dev("switch.a", "dev1", "br", "sw1"),
            ent_with_dev("light.b", "dev2", "br", "lamp2"),
            ent_with_dev("switch.b", "dev2", "br", "sw2"),
        ];
        sync_default_visibility_and_grouping(&pool, inst, initial, &HashMap::new())
            .await
            .unwrap();
        let initial_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM accessory_groups WHERE instance_id = $1 AND source = 'auto'")
                .bind(inst)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(initial_count.0, 2);

        // Second sync: dev2 vanished. Its auto group should be deleted.
        let later = vec![
            ent_with_dev("light.a", "dev1", "br", "lamp1"),
            ent_with_dev("switch.a", "dev1", "br", "sw1"),
        ];
        sync_default_visibility_and_grouping(&pool, inst, later, &HashMap::new())
            .await
            .unwrap();

        let remaining_keys: Vec<(String,)> = sqlx::query_as(
            "SELECT natural_key FROM accessory_groups \
              WHERE instance_id = $1 AND source = 'auto' \
              ORDER BY natural_key",
        )
        .bind(inst)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(remaining_keys.len(), 1);
        assert_eq!(remaining_keys[0].0, "device::dev1");
    }

    #[test]
    fn channel_split_basic() {
        let entries = vec![
            {
                let mut e = entry("switch.x_channel_1");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("开关 左".into());
                e
            },
            {
                let mut e = entry("switch.x_channel_2");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("开关 右".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Each channel should get its own group
        assert_eq!(decisions[0].group_ids, vec!["device::dev1::ch1"]);
        assert_eq!(decisions[1].group_ids, vec!["device::dev1::ch2"]);

        // Both should be primary (each in their own group)
        assert!(decisions[0].group_primary);
        assert!(decisions[1].group_primary);
    }

    #[test]
    fn shared_sensor_attaches_to_all_channels() {
        let entries = vec![
            {
                let mut e = entry("switch.x_channel_1");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("开关 1".into());
                e
            },
            {
                let mut e = entry("switch.x_channel_2");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("开关 2".into());
                e
            },
            {
                let mut e = entry("sensor.x_linkquality");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("信号质量".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Channels get their own groups
        assert_eq!(decisions[0].group_ids, vec!["device::dev1::ch1"]);
        assert_eq!(decisions[1].group_ids, vec!["device::dev1::ch2"]);

        // Shared sensor appears in BOTH groups
        let mut linkquality_groups = decisions[2].group_ids.clone();
        linkquality_groups.sort();
        assert_eq!(linkquality_groups, vec!["device::dev1::ch1", "device::dev1::ch2"]);

        // Channels are primary in their groups, shared sensor is not
        assert!(decisions[0].group_primary);
        assert!(decisions[1].group_primary);
        assert!(!decisions[2].group_primary);
    }

    #[test]
    fn test_l3_lcp_does_not_clobber_channel_split() {
        // P8.1.4 regression: yeelight light "餐桌灯" in 客厅 must not union via
        // Layer-3 LCP with an Aqara dual-channel switch ch1 friendly="餐桌灯开关"
        // (also in 客厅), which would clobber decisions[ch1].group_ids and lose
        // the device::dev_a::ch1 split.
        let entries = vec![
            {
                let mut e = entry("light.yeelight_dining");
                e.device_id = Some("dev_y".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯".into());
                e
            },
            {
                let mut e = entry("switch.aqara_channel_1");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯开关".into());
                e
            },
            {
                let mut e = entry("switch.aqara_channel_2");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯开关".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // ch1 must still be in its channel-split group, not name::xxx
        assert!(
            decisions[1].group_ids.contains(&"device::dev_a::ch1".to_string()),
            "aqara ch1 should be in device::dev_a::ch1, got {:?}",
            decisions[1].group_ids
        );
        assert!(
            !decisions[1].group_ids.iter().any(|g| g.starts_with("name::")),
            "aqara ch1 must not be clobbered by L3 LCP name:: group, got {:?}",
            decisions[1].group_ids
        );

        // ch2 unchanged
        assert!(
            decisions[2].group_ids.contains(&"device::dev_a::ch2".to_string()),
            "aqara ch2 should be in device::dev_a::ch2, got {:?}",
            decisions[2].group_ids
        );
        assert!(
            !decisions[2].group_ids.iter().any(|g| g.starts_with("name::")),
            "aqara ch2 must not be clobbered by L3 LCP name:: group, got {:?}",
            decisions[2].group_ids
        );
    }

    #[test]
    fn single_channel_device_unchanged() {
        // Device with only one channel should NOT split (treated as regular device)
        let entries = vec![{
            let mut e = entry("switch.x_channel_1");
            e.device_id = Some("dev1".into());
            e.friendly_name = Some("开关".into());
            e
        }];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Single channel entity still gets normal device:: group (no ::ch1 suffix)
        // because the device is not "multi-channel" (needs ≥2 channels)
        assert_eq!(decisions[0].group_ids, vec!["device::dev1"]);
        assert!(decisions[0].group_primary);
    }

    #[test]
    fn non_channel_device_unchanged() {
        // Device with multiple entities but no channel suffixes
        let entries = vec![
            {
                let mut e = entry("switch.foo");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("开关".into());
                e
            },
            {
                let mut e = entry("sensor.foo_power");
                e.device_id = Some("dev1".into());
                e.friendly_name = Some("功率".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // Both entities should be in the same device:: group
        assert_eq!(decisions[0].group_ids, vec!["device::dev1"]);
        assert_eq!(decisions[1].group_ids, vec!["device::dev1"]);

        // Switch is primary (domain priority)
        assert!(decisions[0].group_primary);
        assert!(!decisions[1].group_primary);
    }

    // ---------------- P8.2 L3 LCP redesign regression tests ----------------

    #[test]
    fn test_l3_cross_device_no_overmerge() {
        // P8.2 regression: yeelight light "餐桌灯" (single device) and Aqara
        // dual-channel switch "餐桌灯开关" (multi-channel) in the same area
        // must NOT be merged into a single LCP cluster — they are different
        // physical devices that only happen to share a 3-char Chinese
        // friendly_name prefix.
        let entries = vec![
            // yeelight 餐桌灯 — single physical device
            {
                let mut e = entry("light.yeelight_color8");
                e.device_id = Some("dev_y".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯".into());
                e
            },
            // Aqara dual-channel switch — different physical device
            {
                let mut e = entry("switch.aqara_channel_1");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯开关".into());
                e
            },
            {
                let mut e = entry("switch.aqara_channel_2");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("餐桌灯开关".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // yeelight stays in its own device:: group (no Phase-3a merge — only
        // one non-multi-channel device in this area).
        assert_eq!(
            decisions[0].group_ids,
            vec!["device::dev_y"],
            "yeelight 餐桌灯 must stay in device::dev_y, got {:?}",
            decisions[0].group_ids
        );

        // Aqara channels stay in their channel-split groups (multi-channel
        // devices are excluded from Phase-3a entirely).
        assert!(
            decisions[1].group_ids.contains(&"device::dev_a::ch1".to_string()),
            "aqara ch1 must be in device::dev_a::ch1, got {:?}",
            decisions[1].group_ids
        );
        assert!(
            decisions[2].group_ids.contains(&"device::dev_a::ch2".to_string()),
            "aqara ch2 must be in device::dev_a::ch2, got {:?}",
            decisions[2].group_ids
        );

        // Critically: yeelight and Aqara entities must NOT share any group.
        let yeelight_gids: HashSet<&String> = decisions[0].group_ids.iter().collect();
        let aqara_gids: HashSet<&String> = decisions[1]
            .group_ids
            .iter()
            .chain(decisions[2].group_ids.iter())
            .collect();
        let intersection: Vec<&&String> = yeelight_gids.intersection(&aqara_gids).collect();
        assert!(
            intersection.is_empty(),
            "yeelight and Aqara must not share any group, but they share: {:?}",
            intersection
        );
    }

    #[test]
    fn test_l3_multi_integration_merged() {
        // Same physical device exposed via two HA integration paths (e.g.
        // miot legacy + miot cloud cn) yields two distinct device_ids whose
        // friendly_names are identical (or near-identical) in the same
        // area. Phase-3a's device-level cross-device LCP must merge them.
        let entries = vec![
            // Integration path A — device dev_a
            {
                let mut e = entry("media_player.xiaomi_sound_legacy");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅 Xiaomi Sound".into());
                e
            },
            {
                let mut e = entry("sensor.xiaomi_sound_volume_legacy");
                e.device_id = Some("dev_a".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅 Xiaomi Sound 音量".into());
                e
            },
            // Integration path B — device dev_b (same physical speaker)
            {
                let mut e = entry("sensor.xiaomi_sound_info_cloud");
                e.device_id = Some("dev_b".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅 Xiaomi Sound 信息".into());
                e
            },
            {
                let mut e = entry("button.xiaomi_sound_play_cloud");
                e.device_id = Some("dev_b".into());
                e.area_id = Some("living".into());
                e.friendly_name = Some("客厅 Xiaomi Sound 播放".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        // All four entities (across two device_ids) merge into one name:: cluster.
        let g0 = decisions[0].group_id().expect("entity 0 has a group");
        assert!(g0.starts_with("name::"), "expected name:: merge, got {g0}");
        for d in decisions.iter().take(4).skip(1) {
            assert_eq!(
                d.group_id().unwrap(),
                g0,
                "all entities must be in same cluster as entity 0"
            );
        }
    }

    #[test]
    fn test_l3_cluster_secondary_merge() {
        // 客厅空调 5 power-monitoring template sensors (no device_id).
        // After area-strip, pairwise LCP gives 2 separate clusters
        // ({电流,电能表,电压} sharing "空调电"; {功率,功率因素} sharing
        // "空调功率"). Phase-3c secondary merge unions them via cross-LCP
        // of the two base_names → "空调" (2 Chinese chars) ≥ threshold.
        let mut area_names = HashMap::new();
        area_names.insert("living".to_string(), "客厅".to_string());

        let names = [
            "客厅空调电流",
            "客厅空调电能表",
            "客厅空调电压",
            "客厅空调功率",
            "客厅空调功率因素",
        ];
        let entries: Vec<_> = names
            .iter()
            .enumerate()
            .map(|(i, name)| {
                let mut e = entry(&format!("sensor.living_room_air_conditioner_{i}"));
                e.area_id = Some("living".into());
                e.friendly_name = Some((*name).to_string());
                e
            })
            .collect();

        let decisions = compute_decisions(&entries, &area_names);

        let g0 = decisions[0].group_id().expect("sensor 0 has a group");
        assert!(g0.starts_with("name::"), "expected name:: cluster, got {g0}");
        for (i, d) in decisions.iter().enumerate().take(5).skip(1) {
            assert_eq!(
                d.group_id().unwrap(),
                g0,
                "客厅空调 sensor {i} ({}) must merge into the same cluster as sensor 0 ({})",
                names[i],
                names[0]
            );
        }
    }

    #[test]
    fn test_l3_aux_domain_excluded() {
        // automation entities with shared friendly_name prefix must NOT be
        // merged into an LCP cluster — auto/script/scene/update are user-
        // level entities, not physical devices.
        let entries = vec![
            {
                let mut e = entry("automation.zhe_guang_chuang_lian_ban_kai");
                e.area_id = Some("living".into());
                e.friendly_name = Some("遮光窗帘半开".into());
                e
            },
            {
                let mut e = entry("automation.zhe_guang_chuang_lian_guan_bi");
                e.area_id = Some("living".into());
                e.friendly_name = Some("遮光窗帘关闭".into());
                e
            },
            {
                let mut e = entry("automation.zhe_guang_chuang_lian_quan_kai");
                e.area_id = Some("living".into());
                e.friendly_name = Some("遮光窗帘全开".into());
                e
            },
        ];

        let decisions = compute_decisions(&entries, &HashMap::new());

        for (i, d) in decisions.iter().enumerate() {
            assert!(
                d.group_ids.is_empty(),
                "automation {i} must remain a singleton (no LCP group), got {:?}",
                d.group_ids
            );
        }
    }
}
