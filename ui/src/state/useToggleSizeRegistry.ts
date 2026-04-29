import { useEffect } from "react";
import { cycleSizeFor } from "../components/edit/EditableTileWrapper";
import { defaultSizeForEntity } from "../components/home/_helpers";
import type { EntitySize, EntityState, UpdateEntityDisplayDto } from "../types";
import { registerToggleSize } from "./useEditHomeView";

/**
 * Wires the global toggle-size registry (consumed by EditableTileWrapper) to
 * the live entity snapshot + display patch fn. Cycles size on each call and
 * cleans up on unmount.
 */
export function useToggleSizeRegistry(
  entities: ReadonlyMap<string, EntityState>,
  patch: (entityId: string, dto: UpdateEntityDisplayDto) => Promise<unknown>,
): void {
  useEffect(() => {
    registerToggleSize(async (entityId: string) => {
      const entity = entities.get(entityId);
      if (!entity) return;
      const current: EntitySize = entity.size ?? defaultSizeForEntity(entity);
      const next = cycleSizeFor(entity, current);
      if (next === current) return;
      await patch(entityId, { size: next });
    });
    return () => {
      registerToggleSize(null);
    };
  }, [entities, patch]);
}
