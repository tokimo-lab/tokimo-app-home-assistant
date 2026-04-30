import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellToast } from "@tokimo/sdk/react";
import { useCallback } from "react";
import { reorderFavorites, updateEntityDisplay } from "../api/display";
import type {
  EntityState,
  FavoriteReorderItem,
  RoomEntityReorderItem,
  UpdateEntityDisplayDto,
} from "../types";
import { applyOptimistic, getEntitiesSnapshot, getEntity } from "./entityStore";

/**
 * Merge display fields from a patch into an entity, preserving everything
 * else. Returns a new EntityState.
 */
function mergeDisplay(
  entity: EntityState,
  patch: UpdateEntityDisplayDto,
): EntityState {
  return {
    ...entity,
    ...(patch.display_name !== undefined && {
      display_name: patch.display_name,
    }),
    ...(patch.custom_icon !== undefined && { custom_icon: patch.custom_icon }),
    ...(patch.area_id !== undefined && { area_id: patch.area_id }),
    ...(patch.hidden !== undefined && { hidden: patch.hidden }),
    ...(patch.is_favorite !== undefined && { is_favorite: patch.is_favorite }),
    ...(patch.favorite_order !== undefined && {
      favorite_order: patch.favorite_order,
    }),
    ...(patch.size !== undefined && { size: patch.size }),
    ...(patch.sort_order !== undefined && { sort_order: patch.sort_order }),
    ...(patch.decimal_places !== undefined && {
      decimal_places: patch.decimal_places,
    }),
    ...(patch.collapsed !== undefined && { collapsed: patch.collapsed }),
  };
}

/**
 * Optimistic-UI helper for entity-display mutations (size, favorite,
 * sort-order, etc.). Applies the patch locally first, then PATCHes the
 * backend; on failure reverts and toasts.
 */
export function useDisplayPatch(
  instanceId: string | null,
  ctx: AppRuntimeCtx,
  t: (k: string) => string,
) {
  const toast = useShellToast(ctx);

  const patch = useCallback(
    async (entityId: string, dto: UpdateEntityDisplayDto): Promise<void> => {
      if (!instanceId) return;
      const original = getEntity(entityId);
      if (!original) return;

      // When adding to favorites without an explicit order, place at the end.
      let effectiveDto = dto;
      if (dto.is_favorite === true && dto.favorite_order === undefined) {
        let maxOrder = -1;
        for (const e of getEntitiesSnapshot().values()) {
          if (e.is_favorite && (e.favorite_order ?? 0) > maxOrder) {
            maxOrder = e.favorite_order ?? 0;
          }
        }
        effectiveDto = { ...dto, favorite_order: maxOrder + 1 };
      }

      const optimistic = mergeDisplay(original, effectiveDto);
      applyOptimistic(optimistic);

      try {
        await updateEntityDisplay(instanceId, entityId, effectiveDto);
      } catch (err) {
        applyOptimistic(original);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${t("errorSave")}: ${msg}`);
      }
    },
    [instanceId, toast, t],
  );

  const reorderFavoritesOptimistic = useCallback(
    async (items: FavoriteReorderItem[]): Promise<void> => {
      if (!instanceId) return;
      const originals: EntityState[] = [];
      for (const it of items) {
        const e = getEntity(it.entity_id);
        if (e) {
          originals.push(e);
          applyOptimistic({ ...e, favorite_order: it.favorite_order });
        }
      }
      try {
        await reorderFavorites(instanceId, items);
      } catch (err) {
        for (const e of originals) applyOptimistic(e);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${t("errorSave")}: ${msg}`);
      }
    },
    [instanceId, toast, t],
  );

  /**
   * Optimistically reorder entities within a room (or any non-favorite group)
   * by issuing per-entity PATCH calls with the new `sort_order`. Backend has
   * no batch endpoint for this; one PATCH per entity is fine for typical
   * room sizes (< 30 entities).
   */
  const reorderRoomEntitiesOptimistic = useCallback(
    async (items: RoomEntityReorderItem[]): Promise<void> => {
      if (!instanceId) return;
      const originals: EntityState[] = [];
      for (const it of items) {
        const e = getEntity(it.entity_id);
        if (e) {
          originals.push(e);
          applyOptimistic({ ...e, sort_order: it.sort_order });
        }
      }
      try {
        await Promise.all(
          items.map((it) =>
            updateEntityDisplay(instanceId, it.entity_id, {
              sort_order: it.sort_order,
            }),
          ),
        );
      } catch (err) {
        for (const e of originals) applyOptimistic(e);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${t("errorSave")}: ${msg}`);
      }
    },
    [instanceId, toast, t],
  );

  return { patch, reorderFavoritesOptimistic, reorderRoomEntitiesOptimistic };
}
