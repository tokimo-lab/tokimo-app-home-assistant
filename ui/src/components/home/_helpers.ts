/**
 * Shared helpers for HomePage / HomePageDefault / HomePageFiltered.
 * Pure functions — no React, no imports from state layer.
 */

import { getDomain } from "../../lib/domain";
import type { ChipId } from "../../state/useFilterChip";
import type { EntitySize, EntityState } from "../../types";

export const RENDERABLE_DOMAINS = new Set([
  "light",
  "switch",
  "cover",
  "climate",
  "fan",
  "lock",
  "media_player",
  "scene",
  "script",
  "binary_sensor",
  "sensor",
  "camera",
  "vacuum",
  "input_boolean",
  "automation",
  "alarm_control_panel",
]);

export const ENV_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

/**
 * Apple-Home style default sizing (§1.x):
 *  - 连续状态主控 (light / climate / cover / media_player) → medium
 *    (2×1 横长矩形，需要展示亮度/温度/位置/曲目等连续信息)
 *  - 摄像头 (camera) → large (2×2，含封面)
 *  - 传感器 (sensor / binary_sensor) → small，温湿度专门走 medium 以容纳数值
 *  - 纯开关 / 切换类 (switch / input_boolean / automation / fan / lock) → small
 *    (1×1 方块，符合 Apple Home 紧凑布局)
 *  - 其他 (scene / script / vacuum / ...) → small
 */
const MEDIUM_DEFAULT_DOMAINS = new Set([
  "light",
  "climate",
  "cover",
  "media_player",
]);

export function isRenderable(entity: EntityState): boolean {
  return (
    RENDERABLE_DOMAINS.has(getDomain(entity.entity_id)) &&
    !(entity.hidden ?? entity.override?.hidden ?? false)
  );
}

export function passesChip(
  entity: EntityState,
  chipId: ChipId,
  domains: ReadonlySet<string>,
): boolean {
  const d = getDomain(entity.entity_id);
  if (!domains.has(d)) return false;
  if (chipId === "climate" && d === "sensor") {
    const dc = entity.attributes?.device_class;
    if (typeof dc !== "string" || !ENV_SENSOR_CLASSES.has(dc)) return false;
  }
  return true;
}

export function bySortOrder(a: EntityState, b: EntityState): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/**
 * Single source of truth for per-entity default tile size, used both by
 * TileGrid (render path) and useToggleSizeRegistry (size-cycle baseline).
 */
export function defaultSizeForEntity(entity: EntityState): EntitySize {
  const d = getDomain(entity.entity_id);
  if (d === "camera") return "large";
  if (MEDIUM_DEFAULT_DOMAINS.has(d)) return "medium";
  if (d === "sensor") {
    const dc = entity.attributes?.device_class;
    if (dc === "temperature" || dc === "humidity") return "medium";
  }
  return "small";
}

/**
 * Resolve the actual size to render for an entity. Returns the explicit
 * user override when present, otherwise falls back to the domain default.
 */
export function effectiveSizeForEntity(entity: EntityState): EntitySize {
  return entity.size ?? defaultSizeForEntity(entity);
}

/**
 * Apple-Home default home page domain prioritisation:
 *  - Tier 1: actionable controls — shown first.
 *  - Tier 2: scenes / scripts / automations — shown after Tier 1.
 *  - Tier 3: passive sensors / buttons — hidden by default; surfaced via
 *    chip filter or the explicit "show all" toggle.
 *
 * binary_sensor entities with a critical device_class (door / window /
 * motion / smoke …) are promoted to Tier 2 so the user still sees them
 * on the default page (Apple Home shows door/motion sensors per room).
 */
const TIER1_DOMAINS = new Set([
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
]);

const TIER2_DOMAINS = new Set(["scene", "script", "automation"]);

const CRITICAL_BINARY_SENSOR_CLASSES = new Set([
  "door",
  "window",
  "garage_door",
  "opening",
  "motion",
  "occupancy",
  "presence",
  "smoke",
  "gas",
  "moisture",
  "lock",
  "safety",
  "tamper",
  "co",
]);

/**
 * Friendly-name keyword heuristics for switch / binary_sensor demotion.
 *
 * HA exposes many "configuration" switches (AI detection toggle, swing
 * direction, child lock, indicator-light, watermark, …) under the bare
 * `switch` domain. These technically pass the Tier-1 filter but pollute
 * the default home page. We demote them to Tier 3 by name match so
 * real lights / outlets stay on the front page.
 *
 * Symmetrically, binary_sensor entities matching a critical keyword
 * (door / window / motion / leak …) are promoted to Tier 2 even when
 * device_class isn't set — and obvious diagnostic ones (filter / fault
 * / 报警) are pushed to Tier 3.
 *
 * Keyword match is case-insensitive substring on the resolved
 * friendly_name. Keep this list tightly focused on "obviously not
 * day-to-day operation" — when in doubt, leave at Tier 1.
 */
const SWITCH_NOISE_KEYWORDS = [
  // detection / diagnostic
  "检测",
  "report",
  "诊断",
  "diagnostic",
  "ai ",
  "ai检测",
  "灵敏度",
  "sensitivity",
  // motion vanes / swing
  "上下摆风",
  "左右摆风",
  "swing",
  // safety / lock
  "童锁",
  "锁定",
  "calibrate",
  "校准",
  "镜头校准",
  // notifications / alarms / indicators
  "通知",
  "提醒",
  "alarm",
  "buzzer",
  "蜂鸣",
  "指示灯",
  "indicator",
  "夜灯",
  "警告音",
  // OSD / watermark / display
  "状态显示",
  "osd",
  "时间戳",
  "水印",
  "watermark",
  // codec / quality
  "音频编码",
  "码率",
  "bitrate",
  "帧率",
  "fps",
  // camera control / motion
  "摄像机控制",
  "移动侦测",
  "微光全彩",
  "移动追踪",
  "宽动态",
  "宽动态范围",
  "巡航",
  "巡航功能",
  // power / charge / lock / state config
  "充电保护",
  "物理控制锁",
  "默认上电状态",
  "弹窗是否弹出过",
  "存储卡管理",
  // diagnostic state strings
  "状态，true",
  "状态,true",
  "状态true",
  "true：启用中",
  // 小爱音箱 / speaker noise
  "闹钟 开关",
  "勿扰 勿扰",
  "勿扰",
  "睡眠模式",
  // sleep / power-save
  "自动休眠",
  "弱电箱风扇自动休眠",
  // power limits / countdown
  "自定义功率保护",
  "最大功率限制",
  "快捷倒计时",
  "倒计时关闭",
  // door / appliance config
  "门禁静音",
  "auto drying",
  "self-clean",
  "cleaning sequence",
  "auto open",
  "intercom auto open",
  // mute toggles
  "扬声器 静音",
  "静音",
];

const BINARY_SENSOR_NOISE_KEYWORDS = [
  "滤网",
  "滤芯",
  "故障",
  "报警",
  "fault",
  // diagnostic / config status sensors paralleling the switch noise list
  "存储卡",
  "弹窗",
  "默认上电状态",
  "状态，true",
  "状态,true",
];

const BINARY_SENSOR_CRITICAL_KEYWORDS = [
  "门",
  "窗",
  "人体",
  "移动",
  "占用",
  "motion",
  "occupancy",
  "door",
  "window",
  "leak",
  "smoke",
  "gas",
  "co2",
  "co_alarm",
];

function resolveName(entity: EntityState): string {
  const raw =
    entity.display_name ??
    (entity.attributes?.friendly_name as string | undefined) ??
    entity.entity_id;
  return raw.toLowerCase();
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

export type DomainTier = 1 | 2 | 3;

export function domainTier(entity: EntityState): DomainTier {
  const d = getDomain(entity.entity_id);
  if (TIER1_DOMAINS.has(d)) {
    if (d === "switch") {
      const name = resolveName(entity);
      if (matchesAny(name, SWITCH_NOISE_KEYWORDS)) return 3;
    }
    return 1;
  }
  if (TIER2_DOMAINS.has(d)) return 2;
  if (d === "binary_sensor") {
    const name = resolveName(entity);
    if (matchesAny(name, BINARY_SENSOR_NOISE_KEYWORDS)) return 3;
    const dc = entity.attributes?.device_class;
    if (typeof dc === "string" && CRITICAL_BINARY_SENSOR_CLASSES.has(dc)) {
      return 2;
    }
    if (matchesAny(name, BINARY_SENSOR_CRITICAL_KEYWORDS)) return 2;
  }
  return 3;
}

/**
 * Default-home filter: hide Tier 3 entities (passive sensors, buttons …)
 * unless the user has enabled "show all".
 */
export function passesDefaultHome(
  entity: EntityState,
  showAll: boolean,
): boolean {
  if (showAll) return true;
  return domainTier(entity) <= 2;
}

/**
 * Default-home sort: tier asc → friendly_name asc → entity_id.
 *
 * Order is intentionally independent of runtime state (on/off, playing, …)
 * so a tile does not jump when the user toggles it — otherwise it could be
 * pushed past the per-section "Show More" cap and disappear from view.
 *
 * Used when no chip is selected. Chip view keeps its own bySortOrder
 * comparator (user-curated order matters there).
 */
export function defaultHomeOrder(a: EntityState, b: EntityState): number {
  const ta = domainTier(a);
  const tb = domainTier(b);
  if (ta !== tb) return ta - tb;
  const na =
    (a.display_name ??
      (a.attributes?.friendly_name as string | undefined) ??
      a.entity_id) ||
    "";
  const nb =
    (b.display_name ??
      (b.attributes?.friendly_name as string | undefined) ??
      b.entity_id) ||
    "";
  const cmp = na.localeCompare(nb);
  if (cmp !== 0) return cmp;
  return a.entity_id.localeCompare(b.entity_id);
}

/**
 * Trailing tokens stripped from a friendly_name when computing a
 * fallback device key. These are domain-suffix words HA tacks onto an
 * entity name to disambiguate it from the device itself
 * (e.g. "主卧吸顶灯 灯", "客厅电脑插座 开关 开关").
 *
 * Match is case-insensitive on tokens (haystack already lowercased).
 */
const DEVICE_KEY_SUFFIX_TOKENS = new Set([
  "灯",
  "开关",
  "插座",
  "继电器",
  "relay",
  "light",
  "switch",
  "plug",
  "outlet",
]);

/**
 * Normalise a friendly_name into a device-grouping key by stripping
 * trailing duplicate / domain-suffix tokens. Used as fallback when an
 * entity has no `device_id` from the backend.
 */
function nameDeviceKey(name: string): string {
  const tokens = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const prev = tokens[tokens.length - 2];
    if (last === prev || DEVICE_KEY_SUFFIX_TOKENS.has(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

/**
 * Pick the "primary" entity within a same-device, same-domain group:
 *   1. shortest resolved friendly name (likely the cleanest label)
 *   2. shortest entity_id (id without redundant suffixes)
 *   3. lexicographic entity_id for stability
 */
function pickPrimary(a: EntityState, b: EntityState): EntityState {
  const na = resolveName(a);
  const nb = resolveName(b);
  if (na.length !== nb.length) return na.length < nb.length ? a : b;
  if (a.entity_id.length !== b.entity_id.length) {
    return a.entity_id.length < b.entity_id.length ? a : b;
  }
  return a.entity_id.localeCompare(b.entity_id) <= 0 ? a : b;
}

/**
 * De-duplicate entities that represent the same physical device exposed
 * under multiple entity_ids by HA. Within a (device, domain) group only
 * the "primary" entity (see `pickPrimary`) survives.
 *
 * Grouping key:
 *   - When `device_id` is present, it is the authoritative key.
 *   - Otherwise, falls back to a normalised friendly_name + domain so
 *     siblings like "主卧吸顶灯" / "主卧吸顶灯 灯" collapse together.
 *   - Entities without `device_id` AND with an empty normalised name
 *     are treated as unique (returned as-is).
 *
 * The relative order of surviving entities is preserved.
 */
export function dedupByDevice(entities: EntityState[]): EntityState[] {
  const winners = new Map<string, EntityState>();
  const order: string[] = [];
  const passthrough: EntityState[] = [];

  for (const e of entities) {
    const domain = getDomain(e.entity_id);
    let key: string | null = null;
    if (e.device_id) {
      key = `id::${e.device_id}::${domain}`;
    } else {
      const nk = nameDeviceKey(resolveName(e));
      if (nk) key = `name::${nk}::${domain}`;
    }
    if (!key) {
      passthrough.push(e);
      order.push(`__pt::${passthrough.length - 1}`);
      continue;
    }
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, e);
      order.push(key);
    } else {
      winners.set(key, pickPrimary(existing, e));
    }
  }

  return order.map((k) => {
    if (k.startsWith("__pt::")) {
      const idx = Number(k.slice(6));
      return passthrough[idx];
    }
    return winners.get(k) as EntityState;
  });
}

export const CHIP_LABEL_KEY: Record<ChipId, string> = {
  climate: "chipClimate",
  lights: "chipLights",
  security: "chipSecurity",
  speakers_tvs: "chipSpeakersTvs",
  covers: "chipCovers",
  switches: "chipSwitches",
  fans: "chipFans",
};
