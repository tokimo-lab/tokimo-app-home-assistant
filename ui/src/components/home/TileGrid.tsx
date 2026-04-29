import { cn } from "@tokimo/ui";
import type { MouseEvent as ReactMouseEvent } from "react";
import { getDomain } from "../../lib/domain";
import { useEditHomeView } from "../../state/useEditHomeView";
import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";
import { EditableTileWrapper } from "../edit/EditableTileWrapper";
import { ResizeHandle } from "../edit/ResizeHandle";
import { resolveTile } from "../tiles";

interface TileGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  /** Force every tile to this size, ignoring per-entity preference. */
  forceSize?: EntitySize;
  /** Edit-mode flag: enables jiggle + ResizeHandle. */
  editMode?: boolean;
  /**
   * dnd-kit container id for SortableContext participation. When set,
   * each tile in edit mode is wired into useSortable; otherwise tiles
   * jiggle but cannot be dragged.
   */
  sortableContainerId?: string;
  t: (k: string) => string;
}

const SIZE_SPAN: Record<EntitySize, string> = {
  small: "col-span-1 row-span-1 aspect-square",
  medium: "col-span-2 row-span-1 aspect-[2/1]",
  large: "col-span-2 row-span-2 aspect-square",
};

const MEDIUM_DEFAULT = new Set(["climate", "media_player"]);

function defaultSizeFor(entity: EntityState): EntitySize {
  const d = getDomain(entity.entity_id);
  if (d === "camera") return "large";
  if (MEDIUM_DEFAULT.has(d)) return "medium";
  if (d === "sensor") {
    const dc = entity.attributes?.device_class;
    if (dc === "temperature" || dc === "humidity") return "medium";
    return "small";
  }
  if (d === "cover") {
    return typeof entity.attributes?.current_position === "number"
      ? "medium"
      : "small";
  }
  return "small";
}

/**
 * Responsive tile grid using CSS container queries (named `ha-tile-grid`).
 *
 * Breakpoints are relative to the grid container width, not the viewport —
 * so the grid adapts correctly when rendered inside a narrow sidebar or
 * a wide full-screen pane.
 *
 * Columns: 4 (default) → 6 (≥640 px) → 8 (≥1024 px).
 *
 * TODO(P1.2-impl): Tailwind v4 @container arbitrary variants — replace the
 *   inline style fallback with `@lg:grid-cols-8` style container variants
 *   once the design token pass is complete.
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
  t,
}: TileGridProps) {
  const { selectedTileId, toggleSize } = useEditHomeView();
  if (entities.length === 0) return null;

  return (
    <div data-tile-grid-container className="@container w-full">
      <div
        data-edit-mode={editMode ? "true" : undefined}
        className={cn(
          "grid gap-2",
          "grid-cols-4 @[640px]:grid-cols-6 @[1024px]:grid-cols-8",
        )}
      >
        {entities.map((entity) => {
          const Tile = resolveTile(entity);
          const size = forceSize ?? entity.size ?? defaultSizeFor(entity);
          const isSelected = editMode && selectedTileId === entity.entity_id;

          const tile = (
            <Tile
              entity={entity}
              instanceId={instanceId}
              pending={getPending(entity.entity_id)}
              onCall={onCall}
              t={t}
            />
          );

          if (editMode) {
            return (
              <div
                key={entity.entity_id}
                className={cn(SIZE_SPAN[size], "relative")}
              >
                <div className="tile-jiggle h-full w-full">
                  <EditableTileWrapper
                    entity={entity}
                    sortableContainerId={sortableContainerId}
                  >
                    {tile}
                  </EditableTileWrapper>
                </div>
                {isSelected && (
                  <ResizeHandle
                    onClick={() => void toggleSize(entity.entity_id)}
                    t={t}
                  />
                )}
              </div>
            );
          }

          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu is a passive enhancement
            <div
              key={entity.entity_id}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
