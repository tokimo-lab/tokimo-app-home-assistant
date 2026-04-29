import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getEntitiesSnapshot, subscribeRender } from "./entityStore";

export type ChipId =
  | "climate"
  | "lights"
  | "security"
  | "speakers_tvs"
  | "covers"
  | "switches"
  | "fans";

/**
 * Display order matches plan §1.2 priority.
 */
export const CHIP_ORDER: readonly ChipId[] = [
  "climate",
  "lights",
  "security",
  "speakers_tvs",
  "covers",
  "switches",
  "fans",
] as const;

const CHIP_TO_DOMAINS: Record<ChipId, readonly string[]> = {
  climate: ["climate", "sensor"],
  lights: ["light"],
  security: ["lock", "alarm_control_panel", "binary_sensor", "camera"],
  speakers_tvs: ["media_player"],
  covers: ["cover"],
  switches: ["switch", "input_boolean"],
  fans: ["fan"],
};

const ENV_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

export function domainsForChip(chip: ChipId): readonly string[] {
  return CHIP_TO_DOMAINS[chip];
}

function entityIdDomain(entityId: string): string {
  const i = entityId.indexOf(".");
  return i < 0 ? "" : entityId.slice(0, i);
}

/**
 * Whether the chip has at least one matching entity in the current snapshot.
 *
 * climate chip is special-cased: sensor entities only count if their
 * device_class is temperature/humidity (room-environment sensors).
 */
export function chipHasEntities(
  chip: ChipId,
  entities: ReadonlyMap<
    string,
    {
      entity_id: string;
      attributes?: Record<string, unknown>;
      hidden?: boolean;
    }
  >,
): boolean {
  const domains = new Set(CHIP_TO_DOMAINS[chip]);
  for (const ent of entities.values()) {
    if (ent.hidden) continue;
    const d = entityIdDomain(ent.entity_id);
    if (!domains.has(d)) continue;
    if (chip === "climate" && d === "sensor") {
      const dc = ent.attributes?.device_class;
      if (typeof dc !== "string" || !ENV_SENSOR_CLASSES.has(dc)) continue;
    }
    return true;
  }
  return false;
}

export interface UseFilterChipResult {
  selectedChip: ChipId | null;
  selectChip: (chip: ChipId) => void;
  availableChips: ChipId[];
  domainsForChip: (chip: ChipId) => readonly string[];
}

/**
 * Top-of-home chip row state: mutually-exclusive single selection
 * (re-clicking the active chip clears it). State is in-memory only;
 * a refresh resets the selection. Available-chip list is derived from
 * the live entity store snapshot.
 */
export function useFilterChip(): UseFilterChipResult {
  const [selectedChip, setSelectedChip] = useState<ChipId | null>(null);

  const entities = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  const availableChips = (CHIP_ORDER as readonly ChipId[]).filter((c) =>
    chipHasEntities(c, entities),
  );

  // If the active chip is no longer available (e.g. instance switched), drop it.
  useEffect(() => {
    if (selectedChip && !availableChips.includes(selectedChip)) {
      setSelectedChip(null);
    }
  }, [availableChips, selectedChip]);

  const selectChip = useCallback((chip: ChipId) => {
    setSelectedChip((prev) => (prev === chip ? null : chip));
  }, []);

  return {
    selectedChip,
    selectChip,
    availableChips,
    domainsForChip,
  };
}
