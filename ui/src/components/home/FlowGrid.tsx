import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  CallParams,
  EntitySize,
  EntityState,
  FavoriteReorderItem,
  PendingOp,
  UpdateEntityDisplayDto,
} from "../../types";
import { resolveTile } from "../tiles";
import { EditableTile } from "./EditableTile";

interface FlowGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
  editMode?: boolean;
  onPatchDisplay?: (
    entityId: string,
    dto: UpdateEntityDisplayDto,
  ) => void | Promise<void>;
  /** When true and editMode is on, renders the favorite +/− button. Default false. */
  enableFavoriteToggle?: boolean;
  /** When provided AND editMode is true, tiles can be drag-reordered. */
  onReorder?: (items: FavoriteReorderItem[]) => void | Promise<void>;
}

function spanClass(size?: EntitySize): string {
  if (size === "large") return "col-span-2 row-span-2 aspect-square";
  if (size === "medium") return "col-span-2 row-span-1 aspect-[2/1]";
  return "col-span-1 row-span-1 aspect-square";
}

export function FlowGrid({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
  editMode = false,
  onPatchDisplay,
  enableFavoriteToggle = false,
  onReorder,
}: FlowGridProps) {
  const sortable = editMode && !!onReorder;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  if (entities.length === 0) return null;

  const gridChildren = entities.map((entity) => {
    const Tile = resolveTile(entity);
    const tileNode = (
      <EditableTile
        entity={entity}
        editMode={editMode}
        onCycleSize={
          onPatchDisplay
            ? (next) => void onPatchDisplay(entity.entity_id, { size: next })
            : undefined
        }
        onToggleFavorite={
          enableFavoriteToggle && onPatchDisplay
            ? (next) =>
                void onPatchDisplay(entity.entity_id, { is_favorite: next })
            : undefined
        }
        t={t}
      >
        <Tile
          entity={entity}
          instanceId={instanceId}
          pending={getPending(entity.entity_id)}
          onCall={onCall}
          t={t}
        />
      </EditableTile>
    );

    if (sortable) {
      return (
        <SortableCell
          key={entity.entity_id}
          entity={entity}
          spanClassName={spanClass(entity.size)}
        >
          {tileNode}
        </SortableCell>
      );
    }

    return (
      <div key={entity.entity_id} className={spanClass(entity.size)}>
        {tileNode}
      </div>
    );
  });

  const grid = (
    <div
      className="grid auto-rows-fr gap-2"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      }}
    >
      {gridChildren}
    </div>
  );

  if (!sortable) return grid;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entities.findIndex((e) => e.entity_id === active.id);
    const newIndex = entities.findIndex((e) => e.entity_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(entities, oldIndex, newIndex);
    const items: FavoriteReorderItem[] = reordered.map((e, i) => ({
      entity_id: e.entity_id,
      favorite_order: i,
    }));
    void onReorder?.(items);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={entities.map((e) => e.entity_id)}
        strategy={rectSortingStrategy}
      >
        {grid}
      </SortableContext>
    </DndContext>
  );
}

function SortableCell({
  entity,
  spanClassName,
  children,
}: {
  entity: EntityState;
  spanClassName: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entity.entity_id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${spanClassName} touch-none`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
