import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellToast } from "@tokimo/sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { callService } from "../api/entities";
import type { CallParams, EntityState, PendingOp } from "../types";
import { setActiveInstance } from "./activeInstanceStore";
import {
  applyOptimistic,
  getEntity,
  subscribeToSSEUpdates,
} from "./entityStore";

const ACK_TIMEOUT_MS = 3000;

interface PendingEntry extends PendingOp {
  timer: ReturnType<typeof setTimeout>;
  unsub: () => void;
}

/**
 * Optimistic-UI service caller with ack-reconcile:
 * 1. Apply optimistic state immediately
 * 2. Send call_service → get {operation_id, context_id}
 * 3. SSE "updated" with matching context_id → commit (no-op, state already applied)
 * 4. SSE "updated" with non-matching context_id → real wins (already in store), clear pending
 * 5. 3s timeout with no ack → revert + toast error
 */
export function useCallService(instanceId: string | null, ctx: AppRuntimeCtx) {
  const toast = useShellToast(ctx);
  const pendingRef = useRef(new Map<string, PendingEntry>());
  const [, forceRender] = useState(0);
  const instanceIdRef = useRef(instanceId);
  instanceIdRef.current = instanceId;

  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  // Subscribe to SSE updates to handle ack
  useEffect(() => {
    return subscribeToSSEUpdates((entityId, newState, contextId) => {
      const pending = pendingRef.current.get(entityId);
      if (!pending) return;

      // Any SSE update for this entity clears the pending op
      // (either our context_id matched = confirmed, or another update arrived = real wins)
      clearTimeout(pending.timer);
      pending.unsub();
      pendingRef.current.delete(entityId);
      rerender();

      if (contextId && contextId !== pending.context_id && pending.context_id) {
        // Real state arrived that differs from our pending context; store already updated
        void newState; // entityStore has already applied the SSE state
      }
    });
  }, [rerender]);

  const call = useCallback(
    async (params: CallParams): Promise<void> => {
      const id = instanceIdRef.current;
      if (!id) return;

      const {
        entity_id,
        domain,
        service,
        target,
        data,
        optimisticState,
        optimisticAttributes,
      } = params;

      // Get current entity state to save for revert
      const originalState = getEntity(entity_id);

      // Apply optimistic state if provided
      if (optimisticState != null && originalState) {
        const optimistic: EntityState = {
          ...originalState,
          state: optimisticState,
          attributes: optimisticAttributes
            ? { ...originalState.attributes, ...optimisticAttributes }
            : originalState.attributes,
        };
        applyOptimistic(optimistic);

        // Set up timeout revert
        const timer = setTimeout(() => {
          const entry = pendingRef.current.get(entity_id);
          if (!entry) return;
          // Revert to original
          applyOptimistic(entry.original_state);
          entry.unsub();
          pendingRef.current.delete(entity_id);
          rerender();
          toast.error(t("errorTimeout"));
        }, ACK_TIMEOUT_MS);

        const unsub = () => {
          // placeholder; replaced after subscribeToSSEUpdates fires
        };

        const entry: PendingEntry = {
          operation_id: "",
          entity_id,
          optimistic_state: optimistic,
          original_state: originalState,
          created_at: Date.now(),
          timer,
          unsub,
        };

        // Remove any prior pending for same entity
        const prior = pendingRef.current.get(entity_id);
        if (prior) {
          clearTimeout(prior.timer);
          prior.unsub();
        }

        pendingRef.current.set(entity_id, entry);
        rerender();
      }

      try {
        const result = await callService(id, domain, service, {
          target,
          data,
        });

        // Update pending entry with context_id so ack logic can match
        const entry = pendingRef.current.get(entity_id);
        if (entry) {
          entry.operation_id = result.operation_id;
          entry.context_id = result.context_id;
        }
      } catch (e) {
        // Revert on network error
        const entry = pendingRef.current.get(entity_id);
        if (entry) {
          applyOptimistic(entry.original_state);
          clearTimeout(entry.timer);
          entry.unsub();
          pendingRef.current.delete(entity_id);
          rerender();
        }
        if (e instanceof ApiError && e.status === 404) {
          // Instance no longer exists on backend — let route guard reconcile.
          setActiveInstance(null, null);
          return;
        }
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [toast, rerender],
  );

  const getPending = useCallback((entityId: string): PendingOp | undefined => {
    return pendingRef.current.get(entityId);
  }, []);

  return { call, getPending };
}

// t placeholder — real translation injected via ctx in usage
function t(key: string): string {
  const msgs: Record<string, string> = {
    errorTimeout: "No response — reverted",
    errorCallService: "Action failed — reverted",
  };
  return msgs[key] ?? key;
}
