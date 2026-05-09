import { useMemo, useRef, useSyncExternalStore } from "react";
import { getCollectionVersion, subscribeCollection } from "./entityStore";

/**
 * Generic selector that recomputes when `collectionVersion` bumps OR when
 * the selector closure identity changes (i.e. one of its captured deps
 * changed).
 *
 * Pattern:
 *   const groups = useCollectionIndex(
 *     useCallback(() => buildHomePageGroups(rooms, displays), [rooms, displays]),
 *     shallowGroupsEqual,
 *   );
 *
 * The selector should read from the `entityStore` directly (via
 * `getEntitiesSnapshot` / `getEntitySnapshot`) for collection-derived data.
 * Wrap with `useCallback` so its identity tracks its non-store deps —
 * otherwise the cache will recompute every render but still produce a
 * stable ref via `isEqual`.
 *
 * `isEqual` (default `Object.is`) keeps the previous reference stable when
 * the recomputed value is structurally identical, so downstream
 * `React.memo` boundaries don't tear.
 */
export function useCollectionIndex<T>(
  selector: () => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const _version = useSyncExternalStore(
    subscribeCollection,
    getCollectionVersion,
    getCollectionVersion,
  );
  const ref = useRef<{ value: T } | null>(null);
  return useMemo(() => {
    const next = selector();
    if (ref.current && isEqual(ref.current.value, next))
      return ref.current.value;
    ref.current = { value: next };
    return next;
    // version is part of the dep set so this re-runs on collection bumps
    // even when the selector identity is stable.
  }, [selector, isEqual]);
}
