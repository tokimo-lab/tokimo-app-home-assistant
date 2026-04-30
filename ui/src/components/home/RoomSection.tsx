import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useState } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { CallParams, EntityState, HaRoom, PendingOp } from "../../types";
import { DroppableSection } from "../edit/DroppableSection";
import { TileGrid } from "./TileGrid";

interface RoomSectionProps {
  room: HaRoom;
  /** Default-visible entities (passes isHomeVisible). */
  entities: EntityState[];
  /**
   * Secondary entities for this room — `collapsed=true` plus accessory
   * members that aren't `is_primary` in any group. Rendered inline below
   * the visible grid when the user expands the section. Edit mode
   * ignores this list.
   */
  collapsed?: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  onRemoveTile?: (entityId: string) => void;
  removeLabel?: string;
  t: (k: string) => string;
}

export function roomContainerId(roomId: string): string {
  return `room:${roomId}`;
}

export function RoomSection({
  room,
  entities,
  collapsed = [],
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  onOpenRoom,
  onRemoveTile,
  removeLabel,
  t,
}: RoomSectionProps) {
  const { editMode } = useEditHomeView();
  const [expanded, setExpanded] = useState(false);

  // Boundary: with no visible entities outside edit mode the entire
  // section disappears, even when collapsed entities exist (P5.6 spec).
  if (entities.length === 0 && !editMode) return null;

  const containerId = roomContainerId(room.id);

  const header = editMode ? (
    <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
      {room.name}
    </h2>
  ) : (
    <button
      type="button"
      onClick={() => onOpenRoom(room.id)}
      className="mb-3 flex cursor-pointer items-center gap-1 text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
    >
      <span>{room.name}</span>
      <ChevronRight size={18} />
    </button>
  );

  const grid = (
    <TileGrid
      entities={entities}
      instanceId={instanceId}
      getPending={getPending}
      onCall={onCall}
      onContextMenu={onContextMenu}
      editMode={editMode}
      sortableContainerId={editMode ? containerId : undefined}
      onRemoveTile={onRemoveTile}
      removeLabel={removeLabel}
      t={t}
    />
  );

  if (editMode) {
    return (
      <DroppableSection containerId={containerId} header={header} active>
        <SortableContext
          id={containerId}
          items={entities.map((e) => e.entity_id)}
          strategy={rectSortingStrategy}
        >
          {grid}
        </SortableContext>
      </DroppableSection>
    );
  }

  const collapsedCount = collapsed.length;
  const showToggle = collapsedCount > 0;

  return (
    <section>
      {header}
      {grid}
      {expanded && collapsedCount > 0 && (
        <div className="mt-2 opacity-80">
          <TileGrid
            entities={collapsed}
            instanceId={instanceId}
            getPending={getPending}
            onCall={onCall}
            onContextMenu={onContextMenu}
            t={t}
          />
        </div>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex cursor-pointer items-center gap-1 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <ChevronDown
            size={16}
            className={expanded ? "rotate-180 transition" : "transition"}
          />
          <span>
            {expanded
              ? t("hideSecondaryDevices")
              : t("showSecondaryDevices").replace(
                  "{n}",
                  String(collapsedCount),
                )}
          </span>
        </button>
      )}
    </section>
  );
}
