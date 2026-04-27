/**
 * Module-level reactive store for the active HA instance.
 * Mirrors apps/video/components/ActiveLibraryContext.tsx exactly.
 *
 * useSyncExternalStore allows both React components and out-of-tree code
 * (menubar) to read and react to the active instance without prop drilling.
 */
import { useEffect, useSyncExternalStore } from "react";

interface ActiveInstanceInfo {
  id: string | null;
  name: string | null;
}

const DEFAULT: ActiveInstanceInfo = { id: null, name: null };

let current: ActiveInstanceInfo = DEFAULT;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ActiveInstanceInfo {
  return current;
}

export function setActiveInstance(id: string | null, name: string | null) {
  if (current.id === id && current.name === name) return;
  current = { id, name };
  for (const cb of listeners) cb();
}

export function useActiveInstance(): ActiveInstanceInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Hook for the main app: keeps the store in sync with component state. */
export function useSetActiveInstance(
  id: string | null | undefined,
  name: string | null | undefined,
) {
  useEffect(() => {
    setActiveInstance(id ?? null, name ?? null);
    return () => setActiveInstance(null, null);
  }, [id, name]);
}
