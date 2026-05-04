import { useSyncExternalStore } from "react";
import { getAllEntityIds, subscribeCollection } from "./entityStore";

/**
 * Subscribe to the *set* of entity ids. Re-renders only when ids are
 * added / removed or when collection-affecting fields change (see
 * `affectsCollection` in entityStore). The returned array reference is
 * stable across calls within the same `collectionVersion`.
 */
export function useEntityIds(): string[] {
  return useSyncExternalStore(
    subscribeCollection,
    getAllEntityIds,
    getAllEntityIds,
  );
}
