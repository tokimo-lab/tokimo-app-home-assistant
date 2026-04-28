/**
 * Module-level entity cache with two subscription tiers:
 *   1. renderListeners  — fires on ANY change (optimistic + SSE). Used by useEntities.
 *   2. sseListeners     — fires ONLY on SSE-sourced changes. Used by useCallService for ack.
 */
import type { EntityState } from "../types";

type RenderListener = () => void;
type SseListener = (
  entityId: string,
  state: EntityState,
  contextId?: string,
) => void;

let entities = new Map<string, EntityState>();
const renderListeners = new Set<RenderListener>();
const sseListeners = new Set<SseListener>();

// ── useSyncExternalStore API ───────────────────────────────────────────────

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

// ── Mutation API ──────────────────────────────────────────────────────────

function notifyRender() {
  for (const cb of renderListeners) cb();
}

/** Apply a full batch from SSE "snapshot" — fires render but NOT sseListeners. */
export function applyBatch(batch: EntityState[]) {
  const next = new Map<string, EntityState>();
  for (const e of batch) next.set(e.entity_id, e);
  entities = next;
  notifyRender();
}

/** Apply a single SSE "updated" event — fires both render and sseListeners. */
export function applySSEUpdate(entity: EntityState, contextId?: string) {
  const existing = entities.get(entity.entity_id);
  if (
    existing &&
    existing.state === entity.state &&
    existing.last_updated === entity.last_updated
  ) {
    // No real state change — skip Map clone and render notification.
    // Still fire sseListeners so pending optimistic ops can be ack'd.
    for (const cb of sseListeners) cb(entity.entity_id, entity, contextId);
    return;
  }
  entities = new Map(entities);
  entities.set(entity.entity_id, entity);
  notifyRender();
  for (const cb of sseListeners) cb(entity.entity_id, entity, contextId);
}

/** Remove an entity from SSE "removed" event. */
export function removeEntity(entityId: string) {
  if (!entities.has(entityId)) return;
  entities = new Map(entities);
  entities.delete(entityId);
  notifyRender();
}

/**
 * Apply an optimistic state. Fires render listeners but NOT sseListeners,
 * so useCallService won't self-trigger its own ack logic.
 */
export function applyOptimistic(entity: EntityState) {
  entities = new Map(entities);
  entities.set(entity.entity_id, entity);
  notifyRender();
}

/** Clear all entities (instance switch or resync). */
export function clearEntities() {
  entities = new Map();
  notifyRender();
}

export function getEntity(entityId: string): EntityState | undefined {
  return entities.get(entityId);
}
