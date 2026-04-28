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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared sortable list scaffolding used by RoomsTab + FavoritesTab.
 *
 * Items are identified by `id`. Reorder happens via dnd-kit drag OR the
 * up/down arrow buttons on each row. `onReorder` receives the new full
 * ordered id list.
 */

export interface SortableItem {
  id: string;
}

interface SortableListProps<T extends SortableItem> {
  items: T[];
  onReorder: (newOrderIds: string[]) => void;
  renderRow: (item: T) => ReactNode;
}

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderRow,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder(next.map((it) => it.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((it) => it.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1">{items.map(renderRow)}</ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: ReactNode;
  t: (k: string) => string;
}

export function SortableRow({
  id,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  children,
  t,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-sm text-white/90"
    >
      <button
        type="button"
        aria-label={t("dragHandle")}
        className="flex h-8 w-6 cursor-grab items-center justify-center text-white/40 hover:text-white/70 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>

      <div className="flex flex-1 items-center gap-2 min-w-0">{children}</div>

      <button
        type="button"
        aria-label={t("reorderUp")}
        disabled={isFirst}
        onClick={onMoveUp}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-white/60 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label={t("reorderDown")}
        disabled={isLast}
        onClick={onMoveDown}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-white/60 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronDown size={14} />
      </button>
    </li>
  );
}
