import { useCallback, useRef, useSyncExternalStore } from "react";
import { getCollectionVersion, subscribeCollection } from "./entityStore";

/**
 * Generic selector that recomputes only when `collectionVersion` bumps.
 *
 * Pattern:
 *   const groups = useCollectionIndex(
 *     () => buildHomePageGroups(rooms, displays),
 *     shallowGroupsEqual,
 *   );
 *
 * The selector should read from the `entityStore` directly (or any other
 * input that is captured by reference identity in the caller's closure). It
 * MUST be redefined whenever the inputs change, otherwise the cached value
 * sticks. Use `useCallback` / inline-with-deps as appropriate.
 *
 * `isEqual` (default `Object.is`) is used to keep the previous reference
 * stable when the recomputed value is structurally identical, which keeps
 * downstream `React.memo` boundaries from re-rendering.
 */
export function useCollectionIndex<T>(
  selector: () => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const ref = useRef<{ version: number; value: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    const v = getCollectionVersion();
    if (ref.current && ref.current.version === v) return ref.current.value;
    const value = selector();
    if (ref.current && isEqual(ref.current.value, value)) {
      ref.current = { version: v, value: ref.current.value };
      return ref.current.value;
    }
    ref.current = { version: v, value };
    return value;
  }, [selector, isEqual]);

  return useSyncExternalStore(subscribeCollection, getSnapshot, getSnapshot);
}
