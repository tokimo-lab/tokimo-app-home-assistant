/**
 * P7 accessory derivation hooks. Provides reactive views of entity groupings
 * for detail overlays, members management, and tile badge logic.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  type AccessoryView,
  getEntitiesSnapshot,
  subscribeRender,
} from "./entityStore";

/**
 * Derive all accessories (grouped entities) for an instance. This is a global
 * view — not filtered by instanceId. If multi-instance support is needed, the
 * caller must filter by checking `entity.instance_id` (not yet in EntityState).
 *
 * Returns a Map keyed by group_id. Singletons (group_id=null) are excluded.
 */
export function useAccessoryEntities(): Map<string, AccessoryView> {
  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  return useMemo(() => {
    const grouped = new Map<string, Array<import("../types").EntityState>>();

    for (const entity of snapshot.values()) {
      if (!entity.group_id) continue;
      const existing = grouped.get(entity.group_id);
      if (existing) {
        existing.push(entity);
      } else {
        grouped.set(entity.group_id, [entity]);
      }
    }

    const accessories = new Map<string, AccessoryView>();
    for (const [groupId, members] of grouped) {
      const primary = members.find((e) => e.group_primary === true);
      if (!primary) {
        console.warn(
          `[useAccessoryEntities] group_id=${groupId} has no primary, skipping`,
        );
        continue;
      }

      const subMembers = members.filter(
        (e) =>
          e.group_primary === false &&
          e.sub_function_role !== "hidden_in_aggregate",
      );

      accessories.set(groupId, { groupId, primary, members, subMembers });
    }

    return accessories;
  }, [snapshot]);
}

/**
 * Given an entity_id, return the AccessoryView it belongs to (or undefined
 * if the entity is a singleton or not found).
 *
 * Useful for detail overlays to fetch the full accessory context when a user
 * taps a tile.
 */
export function useEntityAccessory(
  entityId: string,
): AccessoryView | undefined {
  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  return useMemo(() => {
    const entity = snapshot.get(entityId);
    if (!entity?.group_id) return undefined;

    // Collect all members of the same group_id
    const members: import("../types").EntityState[] = [];
    for (const e of snapshot.values()) {
      if (e.group_id === entity.group_id) {
        members.push(e);
      }
    }

    const primary = members.find((e) => e.group_primary === true);
    if (!primary) {
      console.warn(
        `[useEntityAccessory] entity ${entityId} has group_id=${entity.group_id} but no primary found`,
      );
      return undefined;
    }

    const subMembers = members.filter(
      (e) =>
        e.group_primary === false &&
        e.sub_function_role !== "hidden_in_aggregate",
    );

    return {
      groupId: entity.group_id,
      primary,
      members,
      subMembers,
    };
  }, [snapshot, entityId]);
}
