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
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type CSSProperties, memo, type ReactNode } from "react";
import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";
import { resolveTile } from "../tiles";

interface FlowGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
  /** Right-click on a tile. The handler receives the entity and the
   *  raw mouse event (so it can read clientX/clientY for popover anchor). */
  onContextMenu?: (entity: EntityState, e: React.MouseEvent) => void;
  /** When provided, tiles can be drag-reordered and the new order is
   *  reported as `(entity, newIndex)` pairs. */
  onReorder?: (orderedIds: string[]) => void | Promise<void>;
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
  onContextMenu,
  onReorder,
}: FlowGridProps) {
  const sortable = !!onReorder;
  // Require a small drag distance so plain clicks still reach the tile body.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  if (entities.length === 0) return null;

  const renderTile = (entity: EntityState): ReactNode => {
    const Tile = resolveTile(entity);
    return (
      <Tile
        entity={entity}
        instanceId={instanceId}
        pending={getPending(entity.entity_id)}
        onCall={onCall}
        t={t}
      />
    );
  };

  const gridChildren = entities.map((entity) => {
    const tile = renderTile(entity);
    const onCtx = onContextMenu
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          onContextMenu(entity, e);
        }
      : undefined;

    if (sortable) {
      return (
        <SortableCell
          key={entity.entity_id}
          entity={entity}
          spanClassName={spanClass(entity.size)}
          onContextMenu={onCtx}
        >
          {tile}
        </SortableCell>
      );
    }

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu is a passive enhancement; the tile inside owns its own interactive role
      <div
        key={entity.entity_id}
        className={spanClass(entity.size)}
        onContextMenu={onCtx}
      >
        {tile}
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
    void onReorder?.(reordered.map((e) => e.entity_id));
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

const SortableCell = memo(
  function SortableCell({
    entity,
    spanClassName,
    onContextMenu,
    children,
  }: {
    entity: EntityState;
    spanClassName: string;
    onContextMenu?: (e: React.MouseEvent) => void;
    children: ReactNode;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: entity.entity_id });
    const style: CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      zIndex: isDragging ? 50 : undefined,
    };
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit attributes inject role/tabindex; contextmenu is a passive enhancement
      <div
        ref={setNodeRef}
        style={style}
        className={`${spanClassName} touch-none`}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
      >
        {children}
      </div>
    );
  },
  (prev, next) =>
    prev.entity === next.entity && prev.onContextMenu === next.onContextMenu,
);
