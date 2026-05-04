import { useCallback, useMemo } from "react";
import {
  bySortOrder,
  CHIP_LABEL_KEY,
  isHomeVisible,
  isRenderable,
  passesChip,
} from "../components/home/_helpers";
import { getDomain } from "../lib/domain";
import type { EntityState, HaInstance, HaRoom } from "../types";
import { getEntitiesSnapshot } from "./entityStore";
import { useAccessoriesSnapshot } from "./useAccessories";
import { useCollectionIndex } from "./useCollectionIndex";
import { type ChipId, domainsForChip } from "./useFilterChip";

export interface UseHomePageDataParams {
  instance: HaInstance;
  rooms: HaRoom[];
  selectedChip: ChipId | null;
  t: (k: string) => string;
}

export interface HomePageData {
  /** All renderable entities (hidden filtered out). */
  allEntities: EntityState[];
  /** allEntities further restricted by the active chip (or === allEntities when no chip). */
  visibleEntities: EntityState[];
  /** visibleEntities grouped by room id. */
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  /**
   * Default-home secondary entities grouped by room id: entities marked
   * `collapsed=true` plus accessory members that aren't primary in any
   * group. Empty when a chip is active.
   */
  collapsedByRoom: ReadonlyMap<string, EntityState[]>;
  /** All renderable cameras, sorted by sort_order. */
  cameras: EntityState[];
  /** All favorited renderable entities, sorted by favorite_order. */
  favorites: EntityState[];
  /** Chip label when a chip is active, instance name otherwise. */
  headerTitle: string;
}

interface DerivedGroups {
  allEntities: EntityState[];
  visibleEntities: EntityState[];
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  collapsedByRoom: ReadonlyMap<string, EntityState[]>;
  cameras: EntityState[];
  favorites: EntityState[];
}

/**
 * Derives every memoized list HomePage needs for layout from the live
 * entity store snapshot plus the active chip + room layout. Pure data
 * layer — no effects, no DOM, no event handlers.
 *
 * The grouping selector is wrapped in {@link useCollectionIndex} so it
 * recomputes only when (a) `collectionVersion` bumps (entities added /
 * removed / hidden / reordered / favorited / re-roomed / resized), or (b)
 * one of `rooms`, `selectedChip`, `secondaryEntityIds` changes. Per-tick
 * state-only updates from the WS stream do NOT invalidate this cache, so
 * downstream consumers receive stable refs across ~22 Hz state churn.
 */
export function useHomePageData({
  instance,
  rooms,
  selectedChip,
  t,
}: UseHomePageDataParams): HomePageData {
  const { secondaryEntityIds } = useAccessoriesSnapshot(instance.id);

  const selector = useCallback((): DerivedGroups => {
    const chipDomains = selectedChip
      ? new Set(domainsForChip(selectedChip))
      : null;
    const allEntities = Array.from(getEntitiesSnapshot().values()).filter(
      isRenderable,
    );

    const visibleEntities =
      selectedChip && chipDomains
        ? allEntities.filter((e) => passesChip(e, selectedChip, chipDomains))
        : allEntities.filter((e) => isHomeVisible(e, secondaryEntityIds));

    const collapsedEntities = selectedChip
      ? ([] as EntityState[])
      : allEntities.filter(
          (e) =>
            !e.hidden &&
            (e.collapsed === true || secondaryEntityIds.has(e.entity_id)),
        );

    const entityRoomId = new Map<string, string>();
    for (const e of allEntities) {
      if (e.area_id) entityRoomId.set(e.entity_id, e.area_id);
    }
    for (const room of rooms) {
      for (const re of room.entities) {
        if (!entityRoomId.has(re.entity_id))
          entityRoomId.set(re.entity_id, room.id);
      }
    }

    const entitiesByRoom = new Map<string, EntityState[]>();
    for (const e of visibleEntities) {
      const rid = entityRoomId.get(e.entity_id);
      if (!rid) continue;
      const arr = entitiesByRoom.get(rid) ?? [];
      arr.push(e);
      entitiesByRoom.set(rid, arr);
    }
    for (const arr of entitiesByRoom.values()) arr.sort(bySortOrder);

    const collapsedByRoom = new Map<string, EntityState[]>();
    for (const e of collapsedEntities) {
      const rid = entityRoomId.get(e.entity_id);
      if (!rid) continue;
      const arr = collapsedByRoom.get(rid) ?? [];
      arr.push(e);
      collapsedByRoom.set(rid, arr);
    }
    for (const arr of collapsedByRoom.values()) arr.sort(bySortOrder);

    const cameras = allEntities
      .filter((e) => getDomain(e.entity_id) === "camera")
      .sort(bySortOrder);

    const favorites = allEntities
      .filter((e) => e.is_favorite)
      .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0));

    return {
      allEntities,
      visibleEntities,
      entitiesByRoom,
      collapsedByRoom,
      cameras,
      favorites,
    };
  }, [rooms, selectedChip, secondaryEntityIds]);

  const groups = useCollectionIndex(selector);

  const headerTitle = useMemo(
    () => (selectedChip ? t(CHIP_LABEL_KEY[selectedChip]) : instance.name),
    [selectedChip, instance.name, t],
  );

  return {
    ...groups,
    headerTitle,
  };
}
