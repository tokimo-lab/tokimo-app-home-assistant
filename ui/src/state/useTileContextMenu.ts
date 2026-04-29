import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useState,
} from "react";
import type { EntitySize, EntityState, UpdateEntityDisplayDto } from "../types";

export interface TileContextMenuState {
  entity: EntityState;
  x: number;
  y: number;
}

export interface UseTileContextMenuResult {
  menu: TileContextMenuState | null;
  openMenu: (entity: EntityState, e: ReactMouseEvent) => void;
  closeMenu: () => void;
  onShowControls: () => void;
  onSetSize: (size: EntitySize) => void;
  onToggleFavorite: (next: boolean) => void;
  onHide: () => void;
}

/**
 * Owns tile context-menu state and the patch-callback wiring. HomePage
 * supplies the patch fn (from useDisplayPatch) and the openDetail fn
 * (from useDetailOverlay); this hook keeps the boilerplate (open coords,
 * close, four handlers) out of the layout layer.
 */
export function useTileContextMenu(
  patch: (entityId: string, dto: UpdateEntityDisplayDto) => Promise<unknown>,
  openDetail: (entityId: string, instanceId: string) => void,
  instanceId: string,
): UseTileContextMenuResult {
  const [menu, setMenu] = useState<TileContextMenuState | null>(null);

  const openMenu = useCallback((entity: EntityState, e: ReactMouseEvent) => {
    setMenu({ entity, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const onShowControls = useCallback(() => {
    if (menu) openDetail(menu.entity.entity_id, instanceId);
  }, [menu, openDetail, instanceId]);

  const onSetSize = useCallback(
    (size: EntitySize) => {
      if (menu) void patch(menu.entity.entity_id, { size });
    },
    [menu, patch],
  );

  const onToggleFavorite = useCallback(
    (next: boolean) => {
      if (menu) void patch(menu.entity.entity_id, { is_favorite: next });
    },
    [menu, patch],
  );

  const onHide = useCallback(() => {
    if (menu) void patch(menu.entity.entity_id, { hidden: true });
  }, [menu, patch]);

  return {
    menu,
    openMenu,
    closeMenu,
    onShowControls,
    onSetSize,
    onToggleFavorite,
    onHide,
  };
}
