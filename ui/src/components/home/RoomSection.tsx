import { ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { CallParams, EntityState, HaRoom, PendingOp } from "../../types";
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
  if (entities.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => onOpenRoom(room.id)}
        className="mb-3 flex cursor-pointer items-center gap-1 text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
      >
        <span>{room.name}</span>
        <ChevronRight size={18} />
      </button>
      <TileGrid
        entities={entities}
        instanceId={instanceId}
        getPending={getPending}
        onCall={onCall}
        onContextMenu={onContextMenu}
        editMode={editMode}
        t={_t}
      />
    </section>
  );
}
