import { useDroppable } from "@dnd-kit/core";
import { cn } from "@tokimo/ui";
import type { ReactNode } from "react";

interface DroppableSectionProps {
  /** Container id used by dnd-kit (e.g. "favorites" or "room:<id>"). */
  containerId: string;
  /** Section heading row (already styled by the caller). */
  header: ReactNode;
  /** Whether to render the drop-target outline (active edit mode). */
  active: boolean;
  children: ReactNode;
}

/**
 * Thin wrapper that turns a section root into a dnd-kit drop target so
 * tiles can be dropped onto an empty section (no SortableItem to land on).
 * In normal mode it renders a plain <section>.
 */
export function DroppableSection({
  containerId,
  header,
  active,
  children,
}: DroppableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId,
    data: { containerId, type: "section" },
    disabled: !active,
  });

  return (
    <section
      ref={active ? setNodeRef : undefined}
      data-testid="droppable-section"
      data-container-id={containerId}
      className={cn(
        "rounded-2xl",
        active && isOver && "ring-2 ring-white/30 ring-offset-2",
      )}
    >
      {header}
      {children}
    </section>
  );
}
