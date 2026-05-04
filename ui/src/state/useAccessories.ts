/**
 * P8.0.2 M:N accessory hooks. Server-side groupings live in
 * `accessory_groups` (tile metadata) + `accessory_group_members`
 * (the M:N join). We fetch both per-instance and join with the live
 * entity store to produce strongly-typed views the UI can consume.
 *
 * One module-level cache per instanceId; consumers share a single
 * fetch lifecycle. Mutations (add/remove/patch member) call `refresh()`
 * to reload and broadcast to all subscribers.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getAccessoryMembers, listAccessories } from "../api/accessories";
import type {
  AccessoryGroup,
  AccessoryMember,
  EntityState,
} from "../types";
import { useActiveInstance } from "./activeInstanceStore";
import { getEntitiesSnapshot, subscribeRender } from "./entityStore";

/**
 * Live-state-joined accessory member. Spreads the `EntityState` so existing
 * call sites can still read `attributes.friendly_name`, `entity_id`, etc.,
 * while the `is_primary` / `sub_function_role` / `sort_order` come from the
 * `accessory_group_members` row.
 */
export interface AccessoryMemberView extends EntityState {
  is_primary: boolean;
  sub_function_role: "hidden_in_aggregate" | "promoted_to_tile" | null;
  member_sort_order: number;
}

export interface AccessoryView {
  /** Accessory group UUID. */
  groupId: string;
  group: AccessoryGroup;
  primary: AccessoryMemberView;
  members: AccessoryMemberView[];
  /**
   * Members that should render in the detail card under the primary —
   * non-primary, not hidden-in-aggregate.
   */
  subMembers: AccessoryMemberView[];
}

interface AccessoriesSnapshot {
  groups: AccessoryGroup[];
  /** group UUID → members in sort order. */
  membersByGroup: Map<string, AccessoryMember[]>;
  /** entity_id → list of group UUIDs that contain it. */
  entityToGroups: Map<string, string[]>;
  /** entity_ids that are `is_primary=true` in any group. */
  primaryEntityIds: Set<string>;
  /**
   * entity_ids that appear in at least one accessory but are NOT primary in
   * any. These are the "secondary / collapsed" members the home + room
   * grids should hide by default.
   */
  secondaryEntityIds: Set<string>;
}

const EMPTY_SNAPSHOT: AccessoriesSnapshot = {
  groups: [],
  membersByGroup: new Map(),
  entityToGroups: new Map(),
  primaryEntityIds: new Set(),
  secondaryEntityIds: new Set(),
};

const cache = new Map<string, AccessoriesSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function notify(instanceId: string) {
  const set = listeners.get(instanceId);
  if (set) for (const cb of set) cb();
}

export function getAccessoriesSnapshot(
  instanceId: string | null,
): AccessoriesSnapshot {
  if (!instanceId) return EMPTY_SNAPSHOT;
  return cache.get(instanceId) ?? EMPTY_SNAPSHOT;
}

/**
 * Reload the accessories cache for an instance and notify all subscribers.
 * Modules outside the React tree (e.g. modal-window children that mutate
 * server state then close) should call this so the parent home page auto-
 * re-renders without needing an explicit prop callback.
 */
export async function refreshAccessoriesCache(
  instanceId: string,
): Promise<void> {
  const next = await loadAccessories(instanceId);
  cache.set(instanceId, next);
  notify(instanceId);
}

async function loadAccessories(
  instanceId: string,
): Promise<AccessoriesSnapshot> {
  const groups = await listAccessories(instanceId);
  const membersByGroup = new Map<string, AccessoryMember[]>();
  const entityToGroups = new Map<string, string[]>();
  const primaryEntityIds = new Set<string>();
  const memberEntityIds = new Set<string>();

  await Promise.all(
    groups.map(async (g) => {
      const members = await getAccessoryMembers(g.id);
      membersByGroup.set(g.id, members);
      for (const m of members) {
        memberEntityIds.add(m.entity_id);
        const arr = entityToGroups.get(m.entity_id) ?? [];
        arr.push(g.id);
        entityToGroups.set(m.entity_id, arr);
        if (m.is_primary) primaryEntityIds.add(m.entity_id);
      }
    }),
  );

  const secondaryEntityIds = new Set<string>();
  for (const id of memberEntityIds) {
    if (!primaryEntityIds.has(id)) secondaryEntityIds.add(id);
  }

  return {
    groups,
    membersByGroup,
    entityToGroups,
    primaryEntityIds,
    secondaryEntityIds,
  };
}

export interface UseAccessoriesResult extends AccessoriesSnapshot {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Subscribe to the accessory cache for `instanceId`. Auto-fetches on mount
 * and on instance change. Call `refresh()` after mutating the server state
 * to repopulate the cache and notify all subscribers.
 */
export function useAccessories(
  instanceId: string | null,
): UseAccessoriesResult {
  const [snapshot, setSnapshot] = useState<AccessoriesSnapshot>(() =>
    getAccessoriesSnapshot(instanceId),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!instanceId) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadAccessories(instanceId);
      cache.set(instanceId, next);
      setSnapshot(next);
      notify(instanceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!instanceId) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    setSnapshot(getAccessoriesSnapshot(instanceId));
    let bag = listeners.get(instanceId);
    if (!bag) {
      bag = new Set();
      listeners.set(instanceId, bag);
    }
    const cb = () => {
      const cached = cache.get(instanceId);
      if (cached) setSnapshot(cached);
    };
    bag.add(cb);
    void refresh();
    return () => {
      bag?.delete(cb);
    };
  }, [instanceId, refresh]);

  return { ...snapshot, loading, error, refresh };
}

/**
 * React subscription to the accessories cache that exposes only the snapshot
 * (no fetch lifecycle). Use this from helpers that just need to read the
 * current view; the `useAccessories` hook somewhere up the tree is
 * responsible for keeping the cache fresh.
 */
export function useAccessoriesSnapshot(
  instanceId: string | null,
): AccessoriesSnapshot {
  return useSyncExternalStore(
    (cb) => {
      if (!instanceId) return () => undefined;
      let bag = listeners.get(instanceId);
      if (!bag) {
        bag = new Set();
        listeners.set(instanceId, bag);
      }
      bag.add(cb);
      return () => {
        bag?.delete(cb);
      };
    },
    () => getAccessoriesSnapshot(instanceId),
    () => getAccessoriesSnapshot(instanceId),
  );
}

/**
 * Lightweight per-entity accessory view that returns just member ids —
 * does NOT subscribe to the live entity store. Use this from components
 * that only need to know "which sub-member ids hang under this primary"
 * and then re-subscribe per row via {@link useEntity}. Re-renders only
 * when the accessories cache for the current instance changes.
 */
export interface AccessoryMemberId {
  entity_id: string;
  is_primary: boolean;
  sub_function_role: "hidden_in_aggregate" | "promoted_to_tile" | null;
  sort_order: number;
}

export interface AccessoryIdView {
  groupId: string;
  group: AccessoryGroup;
  primaryEntityId: string;
  members: AccessoryMemberId[];
  /** non-primary, not hidden_in_aggregate. Sorted by member sort_order. */
  subMemberIds: AccessoryMemberId[];
}

export function useAccessoryMemberIds(
  entityId: string,
): AccessoryIdView | undefined {
  const { id: instanceId } = useActiveInstance();
  const data = useAccessoriesSnapshot(instanceId);

  return useMemo(() => {
    if (!entityId) return undefined;
    const groupIds = data.entityToGroups.get(entityId);
    if (!groupIds || groupIds.length === 0) return undefined;
    const groupId = groupIds[0];
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) return undefined;
    const members = data.membersByGroup.get(groupId) ?? [];
    if (members.length === 0) return undefined;

    const memberIds: AccessoryMemberId[] = members.map((m) => ({
      entity_id: m.entity_id,
      is_primary: m.is_primary,
      sub_function_role: m.sub_function_role,
      sort_order: m.sort_order,
    }));
    const primary = memberIds.find((m) => m.is_primary);
    if (!primary) return undefined;
    const subMemberIds = memberIds.filter(
      (m) => !m.is_primary && m.sub_function_role !== "hidden_in_aggregate",
    );
    return {
      groupId,
      group,
      primaryEntityId: primary.entity_id,
      members: memberIds,
      subMemberIds,
    };
  }, [data, entityId]);
}

/**
 * Resolve the (first) accessory containing the given entity, joined with
 * the live entity store. Returns undefined when the entity belongs to no
 * group, or the resolved primary entity isn't yet in the live snapshot.
 *
 * In the M:N world an entity may belong to several groups. We pick the
 * first one ordered by group sort_order; consumers that need explicit
 * disambiguation should switch to `useAccessories()` and pick by groupId.
 */
export function useEntityAccessory(
  entityId: string,
): AccessoryView | undefined {
  const { id: instanceId } = useActiveInstance();
  const data = useAccessoriesSnapshot(instanceId);
  const liveSnap = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  return useMemo(() => {
    const groupIds = data.entityToGroups.get(entityId);
    if (!groupIds || groupIds.length === 0) return undefined;
    const groupId = groupIds[0];
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) return undefined;
    const members = data.membersByGroup.get(groupId) ?? [];

    const memberViews: AccessoryMemberView[] = [];
    for (const m of members) {
      const live = liveSnap.get(m.entity_id);
      if (!live) continue;
      memberViews.push({
        ...live,
        is_primary: m.is_primary,
        sub_function_role: m.sub_function_role,
        member_sort_order: m.sort_order,
      });
    }

    const primary = memberViews.find((m) => m.is_primary);
    if (!primary) return undefined;

    const subMembers = memberViews.filter(
      (m) => !m.is_primary && m.sub_function_role !== "hidden_in_aggregate",
    );

    return { groupId, group, primary, members: memberViews, subMembers };
  }, [data, entityId, liveSnap]);
}
