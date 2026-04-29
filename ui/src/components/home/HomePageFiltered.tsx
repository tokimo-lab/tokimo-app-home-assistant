import type { MouseEvent as ReactMouseEvent } from "react";
import type { ChipId } from "../../state/useFilterChip";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { bySortOrder } from "./_helpers";
import { CamerasSection } from "./CamerasSection";
import { DomainSummaryBadge } from "./DomainSummaryBadge";
import { RoomSection } from "./RoomSection";

export interface HomePageFilteredProps {
  instance: HaInstance;
  /** All renderable entities (unfiltered); DomainSummaryBadge uses the full map. */
  entities: ReadonlyMap<string, EntityState>;
  /** All renderable cameras (unfiltered); rendered as a top section under Security chip. */
  cameras: EntityState[];
  rooms: HaRoom[];
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  onRemoveTile?: (entityId: string) => void;
  removeLabel?: string;
  t: (k: string) => string;
  editMode: boolean;
  selectedChip: ChipId;
  sortableContainerId?: string;
}

/**
 * Chip-selected layout (§1.2).
 * DomainSummaryBadge at top, then per-room sections using entities pre-filtered
 * by HomePage's chip domain filter. No per-domain sub-grouping needed here;
 * RoomPage handles domain sub-grouping inside a room.
 */
export function HomePageFiltered({
  instance,
  entities,
  cameras,
  rooms,
  entitiesByRoom,
  getPending,
  onCall,
  onContextMenu,
  onOpenRoom,
  onRemoveTile,
  removeLabel,
  t,
  selectedChip,
}: HomePageFilteredProps) {
  return (
    <>
      <DomainSummaryBadge chipId={selectedChip} entities={entities} t={t} />

      {selectedChip === "security" && cameras.length > 0 && (
        <CamerasSection
          cameras={cameras}
          instanceId={instance.id}
          getPending={getPending}
          onCall={onCall}
          onContextMenu={onContextMenu}
          t={t}
        />
      )}

      {rooms.map((room) => {
        const list = (entitiesByRoom.get(room.id) ?? [])
          .slice()
          .sort(bySortOrder);
        if (list.length === 0) return null;
        return (
          <RoomSection
            key={room.id}
            room={room}
            entities={list}
            instanceId={instance.id}
            getPending={getPending}
            onCall={onCall}
            onContextMenu={onContextMenu}
            onOpenRoom={onOpenRoom}
            onRemoveTile={onRemoveTile}
            removeLabel={removeLabel}
            t={t}
          />
        );
      })}
    </>
  );
}
