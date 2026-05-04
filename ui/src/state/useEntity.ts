import { useCallback, useSyncExternalStore } from "react";
import type { EntityState } from "../types";
import { getEntitySnapshot, subscribeEntity } from "./entityStore";

/**
 * Subscribe to a single entity by id. Re-renders the calling component only
 * when that specific entity is added / changed / removed. Returns `undefined`
 * for missing or null/empty ids.
 */
export function useEntity(
  id: string | null | undefined,
): EntityState | undefined {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!id) return () => {};
      return subscribeEntity(id, cb);
    },
    [id],
  );
  const getSnapshot = useCallback(() => {
    if (!id) return undefined;
    return getEntitySnapshot(id);
  }, [id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
