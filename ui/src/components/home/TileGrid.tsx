import { cn } from "@tokimo/ui";
import { LayoutGroup, motion } from "framer-motion";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
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
  entities: EntityState[];
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
 * Breakpoints are relative to the grid container width, not the viewport —
 * so the grid adapts correctly when rendered inside a narrow sidebar or
 * a wide full-screen pane.
 *
 * Column strategy:
 *   <  640 px → 4 cols
 *   ≥  640 px → 6 cols
 *   ≥ 1024 px → 8 cols
 *   ≥ 1440 px → 10 cols (ultra-wide)
 */
export function TileGrid({
  entities,
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
  if (entities.length === 0) return null;

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
          {entities.map((entity) => {
            const Tile = resolveTile(entity);
            const size = forceSize ?? effectiveSizeForEntity(entity);

            const tile = (
              <Tile
                entity={entity}
                instanceId={instanceId}
                pending={getPending(entity.entity_id)}
                onCall={onCall}
                t={t}
                size={size}
              />
            );

            if (editMode) {
              const jiggleStyle: CSSProperties = {
                animationDelay: `${jiggleDelayMs(entity.entity_id)}ms`,
              };
              return (
                <motion.div
                  key={entity.entity_id}
                  layout="position"
                  layoutId={entity.entity_id}
                  transition={LAYOUT_SPRING}
                  data-size={size}
                  data-entity-id={entity.entity_id}
                  className={cn(SIZE_SPAN[size], "relative")}
                >
                  <div
                    className="tile-jiggle h-full w-full"
                    style={jiggleStyle}
                  >
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
                key={entity.entity_id}
                layout="position"
                layoutId={entity.entity_id}
                transition={LAYOUT_SPRING}
                data-size={size}
                data-entity-id={entity.entity_id}
                className={SIZE_SPAN[size]}
                onContextMenu={
                  onContextMenu
                    ? (e) => {
                        e.preventDefault();
                        onContextMenu(entity, e);
                      }
                    : undefined
                }
              >
                {tile}
              </motion.div>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}
