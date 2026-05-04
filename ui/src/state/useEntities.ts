import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createInstanceEventStream } from "../api/events";
import type { ConnStatus, EntityState } from "../types";
import {
  applyBatch,
  applySSEUpdate,
  clearEntities,
  getEntitiesSnapshot,
  removeEntity,
  subscribeRender,
} from "./entityStore";

/**
 * Live full entity map. Resubscribes on every render-tier notification
 * (~22 Hz under HA WS load).
 *
 * Prefer fine-grained alternatives where possible:
 *   - {@link useEntity} for a single entity_id.
 *   - {@link useEntityIds} or {@link useCollectionIndex} when only the
 *     collection / shape matters (hidden / favorite / area / etc.).
 *
 * Use this hook only when a component genuinely needs to scan every
 * entity's live state (e.g. summary chips, domain badges).
 */
export function useEntitiesMap(): ReadonlyMap<string, EntityState> {
  return useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );
}

/**
 * Opens the SSE stream for the given instance, feeds events into the
 * entity store, and exposes the connection status.
 *
 * Components that also need to read entity state should use the
 * fine-grained hooks ({@link useEntity}, {@link useEntityIds},
 * {@link useCollectionIndex}, {@link useEntitiesMap}) — this hook
 * intentionally does NOT return the entity map so it can be called near
 * the app root without dragging the whole tree into the WS-tick render
 * loop.
 */
export function useEntities(instanceId: string | null): {
  connStatus: ConnStatus;
} {
  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Clean up previous stream and clear stale entities
    disposeRef.current?.();
    disposeRef.current = null;
    clearEntities();

    if (!instanceId) {
      setConnStatus("disconnected");
      return;
    }

    setConnStatus("connecting");

    const dispose = createInstanceEventStream(
      instanceId,
      (event) => {
        switch (event.type) {
          case "snapshot":
            applyBatch(event.entities);
            setConnStatus("connected");
            break;

          case "updated":
            applySSEUpdate(event.entity, event.context_id);
            break;

          case "removed":
            removeEntity(event.entity_id);
            break;

          case "status":
            setConnStatus(event.status);
            break;

          case "resync":
            clearEntities();
            break;
        }
      },
      (status) => setConnStatus(status),
    );

    disposeRef.current = dispose;

    return () => {
      dispose();
      disposeRef.current = null;
    };
  }, [instanceId]);

  return { connStatus };
}
