import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { cn } from "@tokimo/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";

export interface TileMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "danger";
  onClick: () => void;
  separator?: boolean;
  desktopOnly?: boolean;
}

export interface TileContextMenuProps {
  open: boolean;
  anchorPoint: { x: number; y: number } | null;
  onClose: () => void;
  items: TileMenuItem[];
}

/**
 * Lightweight desktop hint: pointer:fine OR viewport >= 768px.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia?.("(pointer: fine)").matches === true ||
      window.innerWidth >= 768
    );
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setIsDesktop(mq.matches || window.innerWidth >= 768);
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return isDesktop;
}

/**
 * Long-press / right-click menu, rendered through a FloatingPortal so it
 * escapes any clipped tile container. Anchors to a virtual point; closes on
 * ESC or outside click via floating-ui interactions.
 */
export function TileContextMenu({
  open,
  anchorPoint,
  onClose,
  items,
}: TileContextMenuProps) {
  const isDesktop = useIsDesktop();

  const visibleItems = useMemo(
    () => items.filter((it) => !(it.desktopOnly && !isDesktop)),
    [items, isDesktop],
  );

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, {
    outsidePress: true,
    escapeKey: true,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  // Anchor virtually to the click point.
  useEffect(() => {
    if (!anchorPoint) return;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x: anchorPoint.x,
        y: anchorPoint.y,
        width: 0,
        height: 0,
        top: anchorPoint.y,
        left: anchorPoint.x,
        right: anchorPoint.x,
        bottom: anchorPoint.y,
      }),
    });
  }, [anchorPoint, refs]);

  if (!open || !anchorPoint || visibleItems.length === 0) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        role="menu"
        data-testid="tile-context-menu"
        className={cn(
          "z-[9999] min-w-[220px] overflow-hidden rounded-2xl",
          "border border-white/10 shadow-2xl backdrop-blur-xl",
          "bg-white/90 text-gray-900",
          "dark:bg-surface-raised/90 dark:text-fg-primary",
        )}
      >
        {visibleItems.map((item, idx) => (
          <div key={item.id}>
            {item.separator && idx > 0 && (
              <div className="h-px bg-black/10 dark:bg-white/10" />
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5",
                "text-left text-sm",
                "hover:bg-black/5 dark:hover:bg-white/10",
                item.variant === "danger" && "text-red-600 dark:text-red-400",
              )}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {item.icon && (
                <span className="flex-shrink-0 opacity-70">{item.icon}</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </FloatingPortal>
  );
}
