import { useMemo } from "react";
import {
  bySortOrder,
  CHIP_LABEL_KEY,
  isHomeVisible,
  isRenderable,
  passesChip,
} from "../components/home/_helpers";
import { getDomain } from "../lib/domain";
import type { EntityState, HaInstance, HaRoom } from "../types";
import { type ChipId, domainsForChip } from "./useFilterChip";

export interface UseHomePageDataParams {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  selectedChip: ChipId | null;
  /**
   * When true, the default-home Tier 3 filter is bypassed — every
   * renderable entity is shown and the per-room cap is also lifted by
   * the consumer. No effect when a chip is selected.
   */
  showAll: boolean;
  t: (k: string) => string;
}

export interface HomePageData {
  /** All renderable entities (hidden filtered out). */
  allEntities: EntityState[];
  /** allEntities further restricted by the active chip (or === allEntities when no chip). */
  visibleEntities: EntityState[];
  /** visibleEntities grouped by room id. */
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  /** All renderable cameras, sorted by sort_order. */
  cameras: EntityState[];
  /** All favorited renderable entities, sorted by favorite_order. */
  favorites: EntityState[];
  /** Chip label when a chip is active, instance name otherwise. */
  headerTitle: string;
}

/**
 * Derives every memoized list HomePage needs for layout from the raw
 * entity / room snapshot plus the active chip. Pure data layer — no
 * effects, no DOM, no event handlers.
 */
export function useHomePageData({
  instance,
  entities,
  rooms,
  selectedChip,
  showAll,
  t,
}: UseHomePageDataParams): HomePageData {
  const allEntities = useMemo(
    () => Array.from(entities.values()).filter(isRenderable),
    [entities],
  );

  const chipDomains = useMemo<ReadonlySet<string> | null>(
    () => (selectedChip ? new Set(domainsForChip(selectedChip)) : null),
    [selectedChip],
  );

  const visibleEntities = useMemo(() => {
    if (selectedChip && chipDomains) {
      return allEntities.filter((e) =>
        passesChip(e, selectedChip, chipDomains),
      );
    }
    if (showAll) return allEntities;
    return allEntities.filter(isHomeVisible);
  }, [allEntities, selectedChip, chipDomains, showAll]);

  const entityRoomId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEntities) {
      if (e.area_id) map.set(e.entity_id, e.area_id);
    }
    for (const room of rooms) {
      for (const re of room.entities) {
        if (!map.has(re.entity_id)) map.set(re.entity_id, room.id);
      }
    }
    return map;
  }, [allEntities, rooms]);

  const entitiesByRoom = useMemo(() => {
    const map = new Map<string, EntityState[]>();
    for (const e of visibleEntities) {
      const rid = entityRoomId.get(e.entity_id);
      if (!rid) continue;
      const arr = map.get(rid) ?? [];
      arr.push(e);
      map.set(rid, arr);
    }
    // Backend curates sort_order via entity_overrides; render order is the
    // same for chip and default views — purely user-curated.
    for (const arr of map.values()) arr.sort(bySortOrder);
    return map;
  }, [visibleEntities, entityRoomId]);

  const cameras = useMemo(
    () =>
      allEntities
        .filter((e) => getDomain(e.entity_id) === "camera")
        .sort(bySortOrder),
    [allEntities],
  );

  const favorites = useMemo(
    () =>
      allEntities
        .filter((e) => e.is_favorite)
        .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0)),
    [allEntities],
  );

  const headerTitle = useMemo(
    () => (selectedChip ? t(CHIP_LABEL_KEY[selectedChip]) : instance.name),
    [selectedChip, instance.name, t],
  );

  return {
    allEntities,
    visibleEntities,
    entitiesByRoom,
    cameras,
    favorites,
    headerTitle,
  };
}
