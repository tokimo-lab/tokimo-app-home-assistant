import { useEffect } from "react";
import { cycleSizeFor } from "../components/edit/EditableTileWrapper";
import { effectiveSizeForEntity } from "../components/home/_helpers";
import type { EntitySize, UpdateEntityDisplayDto } from "../types";
import { getEntitySnapshot } from "./entityStore";
import { registerToggleSize } from "./useEditHomeView";

/**
 * Wires the global toggle-size registry (consumed by EditableTileWrapper) to
 * the live entity store + display patch fn. Cycles size on each call and
 * cleans up on unmount. Reads the current entity snapshot at invocation
 * time so the registered callback identity is stable across WS ticks.
 */
export function useToggleSizeRegistry(
  patch: (entityId: string, dto: UpdateEntityDisplayDto) => Promise<unknown>,
): void {
  useEffect(() => {
    registerToggleSize(async (entityId: string) => {
      const entity = getEntitySnapshot(entityId);
      if (!entity) return;
      const current: EntitySize = effectiveSizeForEntity(entity);
      const next = cycleSizeFor(entity, current);
      if (next === current) return;
      await patch(entityId, { size: next });
    });
    return () => {
      registerToggleSize(null);
    };
  }, [patch]);
}
