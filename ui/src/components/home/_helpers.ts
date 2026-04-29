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
 *  - 主控类 (light / switch / fan / lock / climate / cover / input_boolean
 *    / automation / media_player) → medium (2×1 横长矩形)
 *  - 摄像头 (camera) → large (2×2，含封面)
 *  - 传感器 (sensor / binary_sensor) → small，温湿度专门走 medium 以容纳数值
 *  - 其他 (scene / script / vacuum / ...) → small
 */
const MEDIUM_DEFAULT_DOMAINS = new Set([
  "light",
  "switch",
  "input_boolean",
  "automation",
  "fan",
  "lock",
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
 * Resolve the actual size to render for an entity.
 *
 * Backend currently always returns `size: "small"` for entities without a
 * user-issued override (DB column default), which would shadow the domain
 * defaults above. We therefore treat `"small"` from the backend as
 * "unspecified" — only `medium`/`large` are honored as explicit user
 * choices. The size-cycle UI lets users opt into a smaller size by
 * persisting `medium`/`large` and never round-trips through `"small"`
 * unintentionally (see useToggleSizeRegistry).
 */
export function effectiveSizeForEntity(entity: EntityState): EntitySize {
  if (entity.size === "medium" || entity.size === "large") return entity.size;
  return defaultSizeForEntity(entity);
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

export type DomainTier = 1 | 2 | 3;

export function domainTier(entity: EntityState): DomainTier {
  const d = getDomain(entity.entity_id);
  if (TIER1_DOMAINS.has(d)) return 1;
  if (TIER2_DOMAINS.has(d)) return 2;
  if (d === "binary_sensor") {
    const dc = entity.attributes?.device_class;
    if (typeof dc === "string" && CRITICAL_BINARY_SENSOR_CLASSES.has(dc)) {
      return 2;
    }
  }
  return 3;
}

const ON_STATES = new Set(["on", "open", "playing", "heat", "cool", "auto"]);

function isActiveState(entity: EntityState): boolean {
  return ON_STATES.has(entity.state);
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
 * Default-home sort: tier asc → active first → friendly_name asc → entity_id.
 *
 * Used when no chip is selected. Chip view keeps its own bySortOrder
 * comparator (user-curated order matters there).
 */
export function defaultHomeOrder(a: EntityState, b: EntityState): number {
  const ta = domainTier(a);
  const tb = domainTier(b);
  if (ta !== tb) return ta - tb;
  const aa = isActiveState(a) ? 0 : 1;
  const ab = isActiveState(b) ? 0 : 1;
  if (aa !== ab) return aa - ab;
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

export const CHIP_LABEL_KEY: Record<ChipId, string> = {
  climate: "chipClimate",
  lights: "chipLights",
  security: "chipSecurity",
  speakers_tvs: "chipSpeakersTvs",
  covers: "chipCovers",
  switches: "chipSwitches",
  fans: "chipFans",
};
