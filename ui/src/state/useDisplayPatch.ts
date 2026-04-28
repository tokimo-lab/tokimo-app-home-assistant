import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellToast } from "@tokimo/sdk/react";
import { useCallback } from "react";
import { reorderFavorites, updateEntityDisplay } from "../api/display";
import type {
  EntityState,
  FavoriteReorderItem,
  UpdateEntityDisplayDto,
} from "../types";
import { applyOptimistic, getEntity } from "./entityStore";

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

      const optimistic = mergeDisplay(original, dto);
      applyOptimistic(optimistic);

      try {
        await updateEntityDisplay(instanceId, entityId, dto);
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

  return { patch, reorderFavoritesOptimistic };
}
