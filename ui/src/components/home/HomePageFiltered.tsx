import type { MouseEvent as ReactMouseEvent } from "react";
import type { ChipId } from "../../state/useFilterChip";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { DomainSummaryBadge } from "./DomainSummaryBadge";
import { RoomSection } from "./RoomSection";
import { bySortOrder } from "./_helpers";

export interface HomePageFilteredProps {
  instance: HaInstance;
  /** All renderable entities (unfiltered); DomainSummaryBadge uses the full map. */
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  t: (k: string) => string;
  editMode: boolean;
  selectedChip: ChipId;
  sortableContainerId?: string;
}

/**
 * Chip-selected layout:
 *   DomainSummaryBadge (top stat strip) → per-room filtered sub-sections.
 *
 * TODO(P1.1-impl): 按 chipDomains[selectedChip] 过滤每个房间的 entity，生成子
 *   section。当前直接透传 entitiesByRoom（已被 HomePage 按 chip 预过滤）。
 *   后续 P1.1 agent 需在此处实现按 domain 精细分组（每个房间只显示该 chip
 *   涵盖的 domain）并加标题。
 */
export function HomePageFiltered({
  instance,
  entities,
  rooms,
  entitiesByRoom,
  getPending,
  onCall,
  onContextMenu,
  onOpenRoom,
  t,
  selectedChip,
}: HomePageFilteredProps) {
  return (
    <>
      <DomainSummaryBadge chipId={selectedChip} entities={entities} t={t} />

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
            t={t}
          />
        );
      })}
    </>
  );
}
