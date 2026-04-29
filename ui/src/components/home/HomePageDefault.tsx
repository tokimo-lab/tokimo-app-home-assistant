import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { bySortOrder } from "./_helpers";
import { CamerasSection } from "./CamerasSection";
import { FavoritesSection } from "./FavoritesSection";
import { RoomSection } from "./RoomSection";

export interface HomePageDefaultProps {
  instance: HaInstance;
  cameras: EntityState[];
  favorites: EntityState[];
  rooms: HaRoom[];
  /** Pre-sorted, pre-filtered entities per room (sorted by sort_order). */
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  t: (k: string) => string;
  editMode: boolean;
  /** Passed through to TileGrid so tiles participate in the parent DndContext. */
  sortableContainerId?: string;
}

/**
 * Default home layout: CamerasSection → FavoritesSection → RoomSections.
 *
 * DndContext is owned by the parent HomePage (orchestration layer).
 * This component receives pre-computed lists and renders sections.
 */
export function HomePageDefault({
  instance,
  cameras,
  favorites,
  rooms,
  entitiesByRoom,
  getPending,
  onCall,
  onContextMenu,
  onOpenRoom,
  t,
  editMode,
}: HomePageDefaultProps) {
  return (
    <>
      {cameras.length > 0 && (
        <CamerasSection
          cameras={cameras}
          instanceId={instance.id}
          getPending={getPending}
          onCall={onCall}
          onContextMenu={onContextMenu}
          t={t}
        />
      )}
      {(favorites.length > 0 || editMode) && (
        <FavoritesSection
          favorites={favorites}
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
        if (list.length === 0 && !editMode) return null;
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
