/**
 * Module-level entity cache with three subscription tiers:
 *   1. perEntityListeners — fine-grained per-id subscribers (preferred). Fires only
 *      when that specific entity changes / is added / is removed.
 *   2. collectionListeners — fires when the *set* of entity ids changes or when
 *      collection-affecting fields (hidden / favorite_order / sort_order /
 *      area_id / domain) of any entity change. Used by selectors that derive
 *      groupings (room sections, filter chips, …).
 *   3. renderListeners — legacy "any change" listeners. Kept so the existing
 *      `useEntities` hook continues to work during the migration.
 *
 *   sseListeners is independent and fires only on SSE-sourced changes (used by
 *   useCallService to ack optimistic operations).
 *
 * Notification batching: every mutation pushes ids into pending sets and
 * schedules a single requestAnimationFrame flush. A `generation` counter is
 * bumped on `clearEntities` (instance switch) so any in-flight RAF that fires
 * after a switch is discarded.
 */
import type { EntityState } from "../types";

type RenderListener = () => void;
type SseListener = (
  entityId: string,
  state: EntityState,
  contextId?: string,
) => void;
type EntityListener = () => void;
type CollectionListener = () => void;

let entities = new Map<string, EntityState>();

const renderListeners = new Set<RenderListener>();
const sseListeners = new Set<SseListener>();
const perEntityListeners = new Map<string, Set<EntityListener>>();
const collectionListeners = new Set<CollectionListener>();

let generation = 0;
let collectionVersion = 0;
const pendingEntityNotify = new Set<string>();
let pendingCollectionNotify = false;
let scheduledFlushGen: number | null = null;

let cachedIds: string[] | null = null;
let cachedIdsVersion = -1;

// ── Notification scheduling ───────────────────────────────────────────────

function scheduleFlush(): void {
  if (scheduledFlushGen === generation) return;
  const myGen = generation;
  scheduledFlushGen = myGen;
  requestAnimationFrame(() => {
    scheduledFlushGen = null;
    if (myGen !== generation) {
      // Instance switched between schedule and flush — discard stale notifications.
      pendingEntityNotify.clear();
      pendingCollectionNotify = false;
      return;
    }
    const entityIds = Array.from(pendingEntityNotify);
    const fireCollection = pendingCollectionNotify;
    pendingEntityNotify.clear();
    pendingCollectionNotify = false;

    for (const id of entityIds) {
      const set = perEntityListeners.get(id);
      if (!set) continue;
      for (const cb of set) {
        try {
          cb();
        } catch (e) {
          console.error("[entityStore] per-entity listener error", e);
        }
      }
    }
    if (fireCollection) {
      for (const cb of collectionListeners) {
        try {
          cb();
        } catch (e) {
          console.error("[entityStore] collection listener error", e);
        }
      }
    }
    for (const cb of renderListeners) {
      try {
        cb();
      } catch (e) {
        console.error("[entityStore] render listener error", e);
      }
    }
  });
}

function scheduleEntityNotify(id: string): void {
  pendingEntityNotify.add(id);
  scheduleFlush();
}

function scheduleCollectionNotify(): void {
  if (!pendingCollectionNotify) {
    pendingCollectionNotify = true;
    collectionVersion++;
  }
  scheduleFlush();
}

// ── Field helpers ─────────────────────────────────────────────────────────

/** Cheap structural equality for `EntityAttributes`. Falls back to JSON for nested. */
function attributesEqual(
  a: EntityState["attributes"] | undefined,
  b: EntityState["attributes"] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function affectsCollection(
  prev: EntityState | undefined,
  next: EntityState | undefined,
): boolean {
  if (!prev || !next) return true;
  if (prev.entity_id !== next.entity_id) return true;
  if ((prev.hidden ?? false) !== (next.hidden ?? false)) return true;
  if ((prev.is_favorite ?? false) !== (next.is_favorite ?? false)) return true;
  if ((prev.favorite_order ?? 0) !== (next.favorite_order ?? 0)) return true;
  if ((prev.sort_order ?? 0) !== (next.sort_order ?? 0)) return true;
  if ((prev.area_id ?? null) !== (next.area_id ?? null)) return true;
  if ((prev.collapsed ?? false) !== (next.collapsed ?? false)) return true;
  if ((prev.size ?? null) !== (next.size ?? null)) return true;
  // domain is encoded as the prefix of entity_id; same id ⇒ same domain.
  return false;
}

// ── Legacy "any change" API ───────────────────────────────────────────────

export function subscribeRender(cb: RenderListener) {
  renderListeners.add(cb);
  return () => renderListeners.delete(cb);
}

export function getEntitiesSnapshot(): ReadonlyMap<string, EntityState> {
  return entities;
}

// ── SSE ack API ───────────────────────────────────────────────────────────

export function subscribeToSSEUpdates(cb: SseListener): () => void {
  sseListeners.add(cb);
  return () => sseListeners.delete(cb);
}

// ── Fine-grained subscription API ─────────────────────────────────────────

export function subscribeEntity(
  id: string,
  listener: EntityListener,
): () => void {
  let set = perEntityListeners.get(id);
  if (!set) {
    set = new Set();
    perEntityListeners.set(id, set);
  }
  set.add(listener);
  return () => {
    const s = perEntityListeners.get(id);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) perEntityListeners.delete(id);
  };
}

export function getEntitySnapshot(id: string): EntityState | undefined {
  return entities.get(id);
}

export function subscribeCollection(listener: CollectionListener): () => void {
  collectionListeners.add(listener);
  return () => collectionListeners.delete(listener);
}

export function getCollectionVersion(): number {
  return collectionVersion;
}

export function getAllEntityIds(): string[] {
  if (cachedIds && cachedIdsVersion === collectionVersion) return cachedIds;
  cachedIds = Array.from(entities.keys());
  cachedIdsVersion = collectionVersion;
  return cachedIds;
}

// ── Mutation API ──────────────────────────────────────────────────────────

/** Apply a full batch (snapshot). Diffs old/new ids and per-entity changes. */
export function applyBatch(batch: EntityState[]) {
  const next = new Map<string, EntityState>();
  for (const e of batch) next.set(e.entity_id, e);

  let collectionChanged = false;

  // Removed ids
  for (const [id, prev] of entities) {
    if (!next.has(id)) {
      scheduleEntityNotify(id);
      collectionChanged = true;
    } else {
      const n = next.get(id);
      if (
        !n ||
        prev.state !== n.state ||
        prev.last_updated !== n.last_updated ||
        !attributesEqual(prev.attributes, n.attributes)
      ) {
        scheduleEntityNotify(id);
      }
      if (affectsCollection(prev, n)) collectionChanged = true;
    }
  }
  // Added ids
  for (const id of next.keys()) {
    if (!entities.has(id)) {
      scheduleEntityNotify(id);
      collectionChanged = true;
    }
  }

  entities = next;
  if (collectionChanged) scheduleCollectionNotify();
  else scheduleFlush();
}

/** Apply a single SSE "updated" event — fires sseListeners always. */
export function applySSEUpdate(entity: EntityState, contextId?: string) {
  const existing = entities.get(entity.entity_id);
  if (
    existing &&
    existing.state === entity.state &&
    existing.last_updated === entity.last_updated &&
    attributesEqual(existing.attributes, entity.attributes)
  ) {
    // Genuine no-op for renderers; still fire sseListeners so optimistic ack runs.
    for (const cb of sseListeners) cb(entity.entity_id, entity, contextId);
    return;
  }
  entities = new Map(entities);
  entities.set(entity.entity_id, entity);
  scheduleEntityNotify(entity.entity_id);
  if (affectsCollection(existing, entity)) scheduleCollectionNotify();
  else scheduleFlush();
  for (const cb of sseListeners) cb(entity.entity_id, entity, contextId);
}

/** Remove an entity from SSE "removed" event. */
export function removeEntity(entityId: string) {
  if (!entities.has(entityId)) return;
  entities = new Map(entities);
  entities.delete(entityId);
  scheduleEntityNotify(entityId);
  scheduleCollectionNotify();
}

/**
 * Apply an optimistic state. Fires render / per-entity listeners but NOT
 * sseListeners (so useCallService doesn't self-ack).
 */
export function applyOptimistic(entity: EntityState) {
  const existing = entities.get(entity.entity_id);
  entities = new Map(entities);
  entities.set(entity.entity_id, entity);
  scheduleEntityNotify(entity.entity_id);
  if (affectsCollection(existing, entity)) scheduleCollectionNotify();
  else scheduleFlush();
}

/** Clear all entities (instance switch or resync). */
export function clearEntities() {
  if (entities.size === 0) {
    // Still bump generation so any pending flush from the prior instance is discarded.
    generation++;
    pendingEntityNotify.clear();
    pendingCollectionNotify = false;
    return;
  }
  const oldIds = Array.from(entities.keys());
  entities = new Map();
  generation++;
  // Discard anything queued under the previous generation; we'll re-schedule below.
  pendingEntityNotify.clear();
  pendingCollectionNotify = false;
  scheduledFlushGen = null;
  for (const id of oldIds) scheduleEntityNotify(id);
  scheduleCollectionNotify();
}

export function getEntity(entityId: string): EntityState | undefined {
  return entities.get(entityId);
}

// Accessory views for the M:N world live in `state/useAccessories.ts`,
// where they are joined with the per-instance `accessory_groups` /
// `accessory_group_members` server snapshots fetched on demand. The store
// here intentionally has no knowledge of grouping anymore.
