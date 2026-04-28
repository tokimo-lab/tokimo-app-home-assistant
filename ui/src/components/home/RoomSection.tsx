import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { CallParams, EntityState, HaRoom, PendingOp } from "../../types";
import { DroppableSection } from "../edit/DroppableSection";
import { TileGrid } from "./TileGrid";

interface RoomSectionProps {
  room: HaRoom;
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  t: (k: string) => string;
}

export function roomContainerId(roomId: string): string {
  return `room:${roomId}`;
}

export function RoomSection({
  room,
  entities,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  onOpenRoom,
  t: _t,
}: RoomSectionProps) {
  const { editMode } = useEditHomeView();
  if (entities.length === 0 && !editMode) return null;

  const containerId = roomContainerId(room.id);

  const header = editMode ? (
    // In edit mode the section title is plain (no chevron, no nav); the
    // section itself is the drop target.
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
      t={_t}
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

  return (
    <section>
      {header}
      {grid}
    </section>
  );
}
