import { cn } from "@tokimo/ui";
import { LayoutGroup, motion } from "framer-motion";
import {
  type CSSProperties,
  memo,
  type MouseEvent as ReactMouseEvent,
  useCallback,
} from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import { useEntity } from "../../state/useEntity";
import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";
import { EditableTileWrapper } from "../edit/EditableTileWrapper";
import { resolveTile } from "../tiles";
import { effectiveSizeForEntity } from "./_helpers";

interface TileGridProps {
  /** Ordered list of entity ids to render. Each row subscribes per-id. */
  entityIds: string[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  /** Force every tile to this size, ignoring per-entity preference. */
  forceSize?: EntitySize;
  /** Edit-mode flag: enables jiggle + resize handle on selected tile. */
  editMode?: boolean;
  /**
   * dnd-kit container id for SortableContext participation. When set,
   * each tile in edit mode is wired into useSortable; otherwise tiles
   * jiggle but cannot be dragged.
   */
  sortableContainerId?: string;
  /**
   * Called when the red `−` badge in edit mode is clicked. Wired by the
   * host to dispatch a `hidden: true` patch (and optionally clear
   * `is_favorite`).
   */
  onRemoveTile?: (entityId: string) => void;
  removeLabel?: string;
  t: (k: string) => string;
}

const SIZE_SPAN: Record<EntitySize, string> = {
  small: "col-span-1 row-span-1 aspect-square",
  medium: "col-span-2 row-span-1 aspect-[2/1]",
  large: "col-span-2 row-span-2 aspect-square",
};

const LAYOUT_SPRING = {
  type: "spring",
  stiffness: 220,
  damping: 28,
  mass: 1,
} as const;

/**
 * Deterministic per-entity jiggle delay so tiles don't all rotate in
 * sync (AppleHome staggers each tile by a small random offset).
 * Returns a value in (-400ms, 0ms] so every tile starts mid-cycle at a
 * different phase but they all stay within the same 0.4s loop window.
 */
function jiggleDelayMs(entityId: string): number {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = (hash * 31 + entityId.charCodeAt(i)) | 0;
  }
  return -(Math.abs(hash) % 400);
}

/**
 * Responsive tile grid using Tailwind v4 CSS container queries
 * (named container `tiles`).
 *
 * P11: each tile renders inside a `TileSlot` that subscribes only to its
 * own entity, so a single HA WS update repaints just that tile instead of
 * the whole grid.
 */
export function TileGrid({
  entityIds,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  forceSize,
  editMode,
  sortableContainerId,
  onRemoveTile,
  removeLabel,
  t,
}: TileGridProps) {
  // Subscribing to selection changes so the grid re-renders when the
  // selected tile changes (EditableTileWrapper renders the resize handle
  // based on this same store).
  useEditHomeView();
  if (entityIds.length === 0) return null;

  return (
    <div data-tile-grid-container className="@container/tiles w-full">
      <div
        data-edit-mode={editMode ? "true" : undefined}
        className={cn(
          "grid gap-2",
          "grid-cols-4",
          "@[640px]/tiles:grid-cols-6",
          "@[1024px]/tiles:grid-cols-8",
          "@[1440px]/tiles:grid-cols-10",
        )}
      >
        <LayoutGroup>
          {entityIds.map((entityId) => (
            <TileSlot
              key={entityId}
              entityId={entityId}
              instanceId={instanceId}
              getPending={getPending}
              onCall={onCall}
              onContextMenu={onContextMenu}
              forceSize={forceSize}
              editMode={editMode}
              sortableContainerId={sortableContainerId}
              onRemoveTile={onRemoveTile}
              removeLabel={removeLabel}
              t={t}
            />
          ))}
        </LayoutGroup>
      </div>
    </div>
  );
}

interface TileSlotProps {
  entityId: string;
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  forceSize?: EntitySize;
  editMode?: boolean;
  sortableContainerId?: string;
  onRemoveTile?: (entityId: string) => void;
  removeLabel?: string;
  t: (k: string) => string;
}

const TileSlot = memo(function TileSlot({
  entityId,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  forceSize,
  editMode,
  sortableContainerId,
  onRemoveTile,
  removeLabel,
  t,
}: TileSlotProps) {
  const entity = useEntity(entityId);

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (!onContextMenu || !entity) return;
      e.preventDefault();
      onContextMenu(entity, e);
    },
    [onContextMenu, entity],
  );

  if (!entity) return null;

  const Tile = resolveTile(entity);
  const size = forceSize ?? effectiveSizeForEntity(entity);

  const tile = (
    <Tile
      entity={entity}
      instanceId={instanceId}
      pending={getPending(entityId)}
      onCall={onCall}
      t={t}
      size={size}
    />
  );

  if (editMode) {
    const jiggleStyle: CSSProperties = {
      animationDelay: `${jiggleDelayMs(entityId)}ms`,
    };
    return (
      <motion.div
        layout="position"
        layoutId={entityId}
        transition={LAYOUT_SPRING}
        data-size={size}
        data-entity-id={entityId}
        className={cn(SIZE_SPAN[size], "relative")}
      >
        <div className="tile-jiggle h-full w-full" style={jiggleStyle}>
          <EditableTileWrapper
            entity={entity}
            sortableContainerId={sortableContainerId}
            onRemove={onRemoveTile}
            removeLabel={removeLabel}
          >
            {tile}
          </EditableTileWrapper>
        </div>
      </motion.div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu is a passive enhancement
    <motion.div
      layout="position"
      layoutId={entityId}
      transition={LAYOUT_SPRING}
      data-size={size}
      data-entity-id={entityId}
      className={SIZE_SPAN[size]}
      onContextMenu={onContextMenu ? handleContextMenu : undefined}
    >
      {tile}
    </motion.div>
  );
});
