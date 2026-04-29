import { useSyncExternalStore } from "react";

interface EntityMgmtNavState {
  open: boolean;
}

let state: EntityMgmtNavState = { open: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): EntityMgmtNavState {
  return state;
}

export function openEntityMgmt(): void {
  if (state.open) return;
  state = { open: true };
  emit();
}

export function closeEntityMgmt(): void {
  if (!state.open) return;
  state = { open: false };
  emit();
}

/**
 * Page-level open/close state for the Entity Management page.
 *
 * Mirrors `useRoomNav` but with a single boolean (no stack — there is at
 * most one entity-management page on top of HomePage at a time). The host
 * (`<EntityManagementHost>`) renders a slide-in overlay when `open` is true.
 */
export function useEntityMgmtNav(): EntityMgmtNavState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
