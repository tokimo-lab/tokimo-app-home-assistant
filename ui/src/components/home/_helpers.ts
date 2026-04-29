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
 * Default-home visibility filter. Reflects backend-curated state from
 * `entity_overrides`:
 *  - `hidden`        — entity is hidden everywhere.
 *  - `collapsed`     — entity belongs to a section the user collapsed.
 *  - `group_primary` — when entities are grouped by `group_id`, only the
 *                      primary entity is shown on the home page.
 *
 * `group_primary` defaults to `true` for ungrouped entities, so we treat
 * `undefined` / `null` as visible and only suppress when explicitly false.
 */
export function isHomeVisible(entity: EntityState): boolean {
  return !entity.hidden && !entity.collapsed && entity.group_primary !== false;
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
