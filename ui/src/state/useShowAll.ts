import { useCallback, useSyncExternalStore } from "react";

/**
 * "Show all" toggle for the default home page.
 *
 * When false (default), Tier 3 entities (passive sensors / buttons / …)
 * are hidden and per-room sections cap at TILE_CAP. When true, every
 * renderable entity is shown and the cap is lifted — matching the
 * "show all accessories" behaviour seen in some Apple Home contexts.
 *
 * Persisted to localStorage so the preference survives reloads. Chip
 * selection is independent and always shows the full chip-matching set
 * regardless of this toggle.
 */

const STORAGE_KEY = "ha_show_all";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore (private mode etc.)
  }
}

let current = read();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return current;
}

function setShowAll(next: boolean): void {
  if (current === next) return;
  current = next;
  write(next);
  for (const cb of listeners) cb();
}

export interface UseShowAllResult {
  showAll: boolean;
  setShowAll: (value: boolean) => void;
  toggleShowAll: () => void;
}

export function useShowAll(): UseShowAllResult {
  const showAll = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((v: boolean) => setShowAll(v), []);
  const toggle = useCallback(() => setShowAll(!current), []);
  return { showAll, setShowAll: set, toggleShowAll: toggle };
}
