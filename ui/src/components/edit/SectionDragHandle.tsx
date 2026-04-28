import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@tokimo/ui";
import { GripVertical } from "lucide-react";
import type { CSSProperties } from "react";
import type { HaRoom } from "../../types";

interface SectionRowProps {
  room: HaRoom;
  /** Aggregated tile count under this section (just for caption). */
  count: number;
  t: (k: string) => string;
}

/**
 * One row in the "Reorder Sections" list. The whole row is the drag
 * handle (the ⋮⋮ icon is purely visual). Rendered inside a parent
 * SortableContext / DndContext supplied by HomePage.
 */
export function SectionDragRow({ room, count, t: _t }: SectionRowProps) {
  const sortable = useSortable({
    id: room.id,
    data: { containerId: "sections", type: "section-row" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
    zIndex: sortable.isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      data-testid="section-drag-row"
      data-room-id={room.id}
      className={cn(
        "flex items-center gap-3 rounded-2xl",
        "border border-white/[0.06] bg-white/[0.04]",
        "px-4 py-3",
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${room.name}`}
        {...sortable.attributes}
        {...sortable.listeners}
        className={cn(
          "flex h-8 w-8 cursor-grab items-center justify-center rounded-md",
          "text-[var(--text-secondary)] hover:bg-white/[0.06]",
          "active:cursor-grabbing",
        )}
      >
        <GripVertical size={18} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-semibold text-[var(--text-primary)]">
          {room.name}
        </span>
        <span className="truncate text-xs text-[var(--text-secondary)]">
          {count} item{count === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
