import type { SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ChipId } from "../../state/useFilterChip";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { SectionDragRow } from "../edit/SectionDragHandle";
import { HomePageDefault } from "./HomePageDefault";
import { HomePageFiltered } from "./HomePageFiltered";

interface HomePageSectionsProps {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  cameras: EntityState[];
  favorites: EntityState[];
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  selectedChip: ChipId | null;
  editMode: boolean;
  reorderSections: boolean;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (e: DragEndEvent) => void;
  onSectionDragEnd: (e: DragEndEvent) => void;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu: (entity: EntityState, e: ReactMouseEvent) => void;
  onOpenRoom: (roomId: string) => void;
  disableRoomCap: boolean;
  t: (k: string) => string;
}

/**
 * Renders the three mutually-exclusive layout modes:
 *   - reorderSections: vertical drag list of room headers.
 *   - editMode: DnD-wrapped default/filtered sections (jiggle + reorder tiles).
 *   - normal: plain default/filtered sections.
 */
export function HomePageSections(props: HomePageSectionsProps) {
  const {
    instance,
    entities,
    rooms,
    cameras,
    favorites,
    entitiesByRoom,
    selectedChip,
    editMode,
    reorderSections,
    sensors,
    onDragEnd,
    onSectionDragEnd,
    getPending,
    onCall,
    onContextMenu,
    onOpenRoom,
    disableRoomCap,
    t,
  } = props;

  const sharedSectionProps = {
    instance,
    getPending,
    onCall,
    onContextMenu,
    onOpenRoom,
    t,
    editMode,
  };
  const filteredProps = {
    ...sharedSectionProps,
    entities,
    cameras,
    rooms,
    entitiesByRoom,
  };
  const defaultProps = {
    ...sharedSectionProps,
    cameras,
    favorites,
    rooms,
    entitiesByRoom,
    disableRoomCap,
  };

  if (reorderSections) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onSectionDragEnd}
      >
        <SortableContext
          id="sections"
          items={rooms.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {rooms.map((room) => (
              <SectionDragRow
                key={room.id}
                room={room}
                count={(entitiesByRoom.get(room.id) ?? []).length}
                t={t}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  const body = selectedChip ? (
    <HomePageFiltered {...filteredProps} selectedChip={selectedChip} />
  ) : (
    <HomePageDefault {...defaultProps} />
  );

  if (editMode) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        {body}
      </DndContext>
    );
  }

  return body;
}
