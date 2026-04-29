import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@tokimo/ui";
import { ArrowDownRight, Minus } from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
} from "react";
import { getDomain } from "../../lib/domain";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { EntitySize, EntityState } from "../../types";

interface EditableTileWrapperProps {
  entity: EntityState;
  /**
   * dnd-kit container id (e.g. "favorites" or "room:<room_id>"). When
   * provided, the wrapper participates in a SortableContext and the
   * overlay button becomes the drag handle.
   */
  sortableContainerId?: string;
  /**
   * Click handler for the top-left red `−` badge. Removes the entity
   * from the default home view (host typically dispatches `hidden: true`
   * + `is_favorite: false` via useDisplayPatch).
   */
  onRemove?: (entityId: string) => void;
  /** Localised aria-label for the remove badge (e.g. "Remove from Home"). */
  removeLabel?: string;
  children: ReactNode;
}

/**
 * Wraps any tile in edit-mode chrome:
 *   - Apple-Home-style jiggle animation (CSS class .ha-tile-jiggle, defined
 *     in src/index.css).
 *   - Click captures select; ignores any underlying tile click handler.
 *   - When selected, shows a ring halo and the ↗ resize handle in the
 *     top-right corner that cycles through valid sizes for the entity's
 *     domain.
 *   - When sortableContainerId is set, attaches dnd-kit useSortable so the
 *     tile body is the drag handle and inter-section drag works.
 *
 * This component is purely presentational + interaction. The actual size
 * mutation goes through useEditHomeView.toggleSize, which dispatches to
 * whatever HomePage registered via registerToggleSize.
 */
export function EditableTileWrapper({
  entity,
  sortableContainerId,
  onRemove,
  removeLabel,
  children,
}: EditableTileWrapperProps) {
  const { selectedTileId, selectTile, toggleSize } = useEditHomeView();
  const selected = selectedTileId === entity.entity_id;

  // useSortable is always called (Rules of Hooks); we just feed it a
  // throwaway containerId when DnD is disabled. The disabled flag below
  // suppresses any actual DnD wiring in that case.
  const sortable = useSortable({
    id: entity.entity_id,
    data: { containerId: sortableContainerId ?? "__none__", type: "tile" },
    disabled: !sortableContainerId,
  });

  const style: CSSProperties = sortableContainerId
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : undefined,
        zIndex: sortable.isDragging ? 50 : undefined,
      }
    : {};

  const handleSelect = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      selectTile(selected ? null : entity.entity_id);
    },
    [selected, entity.entity_id, selectTile],
  );

  const handleResize = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void toggleSize(entity.entity_id);
    },
    [entity.entity_id, toggleSize],
  );

  const handleRemove = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove?.(entity.entity_id);
    },
    [entity.entity_id, onRemove],
  );

  return (
    <div
      ref={sortableContainerId ? sortable.setNodeRef : undefined}
      data-testid="editable-tile-wrapper"
      data-selected={selected || undefined}
      data-entity-id={entity.entity_id}
      className={cn(
        "relative h-full w-full rounded-[22px]",
        selected &&
          "ring-2 ring-white/90 ring-offset-2 ring-offset-transparent",
      )}
      style={style}
    >
      {children}

      {/* Click/drag overlay: swallows pointer events so the underlying tile
          ignores its own handlers while in edit mode. dnd-kit listeners
          attach here so the whole tile body is the drag handle. */}
      <button
        type="button"
        aria-label={`Edit ${entity.entity_id}`}
        onClick={handleSelect}
        onContextMenu={(e) => e.preventDefault()}
        {...(sortableContainerId
          ? { ...sortable.attributes, ...sortable.listeners }
          : {})}
        className={cn(
          "absolute inset-0 cursor-grab rounded-[22px] active:cursor-grabbing",
          "bg-transparent",
        )}
      />

      {onRemove && (
        <button
          type="button"
          data-testid="tile-remove-badge"
          aria-label={removeLabel ?? `Remove ${entity.entity_id}`}
          onClick={handleRemove}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute -top-1.5 -left-1.5 z-10 flex h-6 w-6 items-center justify-center",
            "cursor-pointer rounded-full bg-red-500 text-white shadow-lg",
            "ring-2 ring-white/90 transition-transform hover:scale-110",
          )}
        >
          <Minus size={14} strokeWidth={3} />
        </button>
      )}

      {selected && (
        <button
          type="button"
          data-testid="tile-resize-handle"
          aria-label={`Resize ${entity.entity_id}`}
          onClick={handleResize}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute -bottom-1.5 -right-1.5 z-10 flex h-7 w-7 items-center justify-center",
            "cursor-pointer rounded-full bg-gray-900 text-white shadow-lg",
            "ring-1 ring-white/60 transition-transform hover:scale-110",
          )}
        >
          <ArrowDownRight size={14} />
        </button>
      )}
    </div>
  );
}

const CAMERA_DOMAIN = "camera";

const STANDARD_CYCLE: readonly EntitySize[] = ["small", "medium", "large"];
const CAMERA_CYCLE: readonly EntitySize[] = ["medium", "large"];

/**
 * Compute the next size in the cycle for a given entity. Standard tiles
 * cycle through all three AppleHome sizes (1×1 → 2×1 → 2×2 → 1×1).
 * Cameras start at medium (1×1 is too small for a thumbnail) and just
 * toggle between medium and large.
 */
export function cycleSizeFor(
  entity: EntityState,
  current: EntitySize,
): EntitySize {
  const cycle =
    getDomain(entity.entity_id) === CAMERA_DOMAIN
      ? CAMERA_CYCLE
      : STANDARD_CYCLE;
  const idx = cycle.indexOf(current);
  if (idx < 0) return cycle[0] ?? "small";
  return cycle[(idx + 1) % cycle.length] ?? cycle[0] ?? "small";
}
