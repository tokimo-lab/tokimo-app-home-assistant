import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface DetailPopoverProps {
  anchor: HTMLElement;
  children: ReactNode;
  onClose: () => void;
  title?: string;
}

/**
 * Fixed-position popover rendered via portal.
 * Positions itself near the anchor element, respecting viewport edges.
 * Closes on ESC or click outside.
 */
export function DetailPopover({
  anchor,
  children,
  onClose,
  title,
}: DetailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Compute position
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 300;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = rect.left + rect.width / 2 - popoverWidth / 2;
  left = Math.max(8, Math.min(left, viewportW - popoverWidth - 8));

  let top = rect.bottom + 8;
  // If too close to bottom, flip above
  if (top + 320 > viewportH && rect.top > 320) {
    top = rect.top - 328;
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onPointerDown={onClose} />
      {/* Popover */}
      <div
        ref={popoverRef}
        className="fixed z-[9999] w-[300px] rounded-2xl border border-white/10 bg-[var(--surface-elevated,#1f2937)] shadow-2xl"
        style={{ left, top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-medium text-sm text-[var(--text-primary)]">
              {title}
            </span>
            <button
              type="button"
              className="cursor-pointer rounded-full p-1 hover:bg-white/10 text-[var(--text-secondary)]"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}
