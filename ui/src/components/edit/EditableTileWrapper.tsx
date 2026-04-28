import { cn } from "@tokimo/ui";
import { Maximize2 } from "lucide-react";
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
  /** Optional inline style — used by dnd-kit transform/transition (commit 3). */
  style?: CSSProperties;
  /** Drag-handle props from useSortable (attached in commit 3). */
  dragHandleProps?: Record<string, unknown>;
  /** ref forwarded by parent, also used by useSortable (commit 3). */
  innerRef?: (el: HTMLDivElement | null) => void;
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
 *
 * This component is purely presentational + interaction. The actual size
 * mutation goes through useEditHomeView.toggleSize, which dispatches to
 * whatever HomePage registered via registerToggleSize.
 */
export function EditableTileWrapper({
  entity,
  style,
  dragHandleProps,
  innerRef,
  children,
}: EditableTileWrapperProps) {
  const { selectedTileId, selectTile, toggleSize } = useEditHomeView();
  const selected = selectedTileId === entity.entity_id;

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

  return (
    <div
      ref={innerRef}
      data-testid="editable-tile-wrapper"
      data-selected={selected || undefined}
      data-entity-id={entity.entity_id}
      className={cn(
        "ha-tile-jiggle relative h-full w-full rounded-[22px]",
        selected &&
          "ring-2 ring-white/90 ring-offset-2 ring-offset-transparent",
      )}
      style={style}
    >
      {children}

      {/* Click/drag overlay: swallows pointer events so the underlying tile
          ignores its own handlers while in edit mode. dnd-kit listeners
          attach here in commit 3 so the whole tile body is the drag handle. */}
      <button
        type="button"
        aria-label={`Edit ${entity.entity_id}`}
        onClick={handleSelect}
        onContextMenu={(e) => e.preventDefault()}
        {...(dragHandleProps ?? {})}
        className={cn(
          "absolute inset-0 cursor-grab rounded-[22px] active:cursor-grabbing",
          "bg-transparent",
        )}
      />

      {selected && (
        <button
          type="button"
          data-testid="tile-resize-handle"
          aria-label={`Resize ${entity.entity_id}`}
          onClick={handleResize}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute -top-1.5 -right-1.5 z-10 flex h-7 w-7 items-center justify-center",
            "cursor-pointer rounded-full bg-gray-900 text-white shadow-lg",
            "ring-1 ring-white/60 transition-transform hover:scale-110",
          )}
        >
          <Maximize2 size={14} />
        </button>
      )}
    </div>
  );
}

const CAMERA_DOMAIN = "camera";

const NON_CAMERA_CYCLE: readonly EntitySize[] = ["small", "medium"];
const CAMERA_CYCLE: readonly EntitySize[] = ["small", "medium", "large"];

/**
 * Compute the next size in the cycle for a given entity. Cameras have an
 * extra "large" step; everything else just toggles small ↔ medium.
 */
export function cycleSizeFor(
  entity: EntityState,
  current: EntitySize,
): EntitySize {
  const cycle =
    getDomain(entity.entity_id) === CAMERA_DOMAIN
      ? CAMERA_CYCLE
      : NON_CAMERA_CYCLE;
  const idx = cycle.indexOf(current);
  if (idx < 0) return cycle[0] ?? "small";
  return cycle[(idx + 1) % cycle.length] ?? cycle[0] ?? "small";
}
