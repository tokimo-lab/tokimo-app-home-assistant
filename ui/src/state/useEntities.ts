import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createInstanceEventStream } from "../api/events";
import type { ConnStatus } from "../types";
import {
  applyBatch,
  applySSEUpdate,
  clearEntities,
  getEntitiesSnapshot,
  removeEntity,
  subscribeRender,
} from "./entityStore";

/**
 * Opens an SSE stream for the given instance, feeds events into entityStore,
 * and returns the live entity map + connection status.
 */
export function useEntities(instanceId: string | null) {
  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const disposeRef = useRef<(() => void) | null>(null);

  const entities = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

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

  return { entities, connStatus };
}
