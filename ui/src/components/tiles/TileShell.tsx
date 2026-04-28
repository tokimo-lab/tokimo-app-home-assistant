import { cn } from "@tokimo/ui";
import { Maximize2 } from "lucide-react";
import {
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 8;

export type TileSize = "small" | "medium" | "large";
export type TileVisualState = "on" | "off" | "unavailable" | "active";

export interface TileShellProps {
  // Three-region callbacks
  onIconClick?: (e: ReactMouseEvent) => void;
  onBodyClick?: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onLongPress?: (e: ReactPointerEvent) => void;

  // Visual
  size?: TileSize;
  state: TileVisualState;
  icon: ReactNode;
  name: string;
  statusLine?: string;

  // Domain hint for "active" state coloring (climate/lock/cover/...)
  domain?: string;

  // Edit mode
  editMode?: boolean;
  selected?: boolean;
  onResizeClick?: () => void;
  onSelect?: () => void;

  // dnd-kit drag passthrough
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;

  className?: string;
}

const SIZE_TO_GRID: Record<TileSize, string> = {
  small: "col-span-1 row-span-1",
  medium: "col-span-2 row-span-1",
  large: "col-span-2 row-span-2",
};

const SIZE_TO_MIN: Record<TileSize, string> = {
  small: "min-h-[80px]",
  medium: "min-h-[80px]",
  large: "min-h-[170px]",
};

function activeBgForDomain(domain: string | undefined): string {
  switch (domain) {
    case "climate":
      return "bg-sky-500";
    case "lock":
      return "bg-emerald-500";
    case "cover":
      return "bg-violet-500";
    case "media_player":
      return "bg-rose-500";
    default:
      return "bg-yellow-400";
  }
}

function iconBgFor(state: TileVisualState, domain: string | undefined): string {
  switch (state) {
    case "on":
      return "bg-yellow-400 text-black";
    case "active":
      return `${activeBgForDomain(domain)} text-white`;
    case "off":
      return "bg-gray-400/30 text-white/70";
    case "unavailable":
      return "bg-gray-500/20 text-white/40";
  }
}

/**
 * Common shell for every tile: handles three-region click split
 * (icon = toggle, body = detail, long-press / contextmenu = menu),
 * the edit-mode jiggle animation, and the ↗ resize handle.
 *
 * No business logic here — pure presentational + interaction shell.
 */
export function TileShell({
  onIconClick,
  onBodyClick,
  onContextMenu,
  onLongPress,
  size = "small",
  state,
  icon,
  name,
  statusLine,
  domain,
  editMode = false,
  selected = false,
  onResizeClick,
  onSelect,
  dragHandleProps,
  className,
}: TileShellProps) {
  const pointerIdRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const movedRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cancelTimer(), [cancelTimer]);

  const handleBodyPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (state === "unavailable") return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      pointerIdRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      longPressedRef.current = false;
      movedRef.current = false;
      cancelTimer();
      timerRef.current = setTimeout(() => {
        longPressedRef.current = true;
        timerRef.current = null;
        onLongPress?.(e);
      }, LONG_PRESS_MS);
    },
    [cancelTimer, onLongPress, state],
  );

  const handleBodyPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const start = startPosRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        movedRef.current = true;
        cancelTimer();
      }
    },
    [cancelTimer],
  );

  const handleBodyPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      cancelTimer();
      pointerIdRef.current = null;
      startPosRef.current = null;
    },
    [cancelTimer],
  );

  const handleBodyPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      cancelTimer();
      pointerIdRef.current = null;
      startPosRef.current = null;
      longPressedRef.current = false;
      movedRef.current = false;
    },
    [cancelTimer],
  );

  const handleBodyClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (state === "unavailable") return;
      if (longPressedRef.current || movedRef.current) {
        longPressedRef.current = false;
        movedRef.current = false;
        return;
      }
      if (editMode) {
        onSelect?.();
        return;
      }
      onBodyClick?.(e);
    },
    [editMode, onBodyClick, onSelect, state],
  );

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!onContextMenu) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      onContextMenu(e);
    },
    [onContextMenu],
  );

  const handleIconClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (state === "unavailable") return;
      if (editMode) {
        onSelect?.();
        return;
      }
      onIconClick?.(e);
    },
    [editMode, onIconClick, onSelect, state],
  );

  const isUnavailable = state === "unavailable";
  const tileBg = selected
    ? "bg-white text-gray-900"
    : "bg-[var(--surface-elevated,#1f2937)] text-white";

  return (
    // biome-ignore lint/a11y/useSemanticElements: outer must remain a div to allow nesting the icon-region <button> inside; nested <button> is invalid HTML. The keyboard handler below preserves accessibility.
    <div
      role="button"
      tabIndex={isUnavailable ? -1 : 0}
      aria-label={name}
      data-testid="tile-shell"
      data-state={state}
      data-edit-mode={editMode || undefined}
      data-selected={selected || undefined}
      className={cn(
        "relative select-none rounded-[22px] p-3",
        "transition-transform active:scale-[0.97]",
        SIZE_TO_GRID[size],
        SIZE_TO_MIN[size],
        tileBg,
        isUnavailable && "opacity-50",
        !isUnavailable && "cursor-pointer",
        editMode && "ha-tile-jiggle",
        className,
      )}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={handleBodyPointerUp}
      onPointerCancel={handleBodyPointerCancel}
      onClick={handleBodyClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isUnavailable) {
          e.preventDefault();
          if (editMode) onSelect?.();
          else onBodyClick?.(e as unknown as ReactMouseEvent<HTMLDivElement>);
        }
      }}
      {...(dragHandleProps ?? {})}
    >
      <div className="flex h-full flex-col justify-between gap-2">
        <button
          type="button"
          data-testid="tile-icon"
          aria-label={`${name} toggle`}
          tabIndex={isUnavailable ? -1 : 0}
          disabled={isUnavailable}
          onClick={handleIconClick}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            "transition-colors",
            iconBgFor(state, domain),
            !isUnavailable && "cursor-pointer",
          )}
        >
          {icon}
        </button>

        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              selected ? "text-gray-900" : "text-white",
            )}
          >
            {name}
          </p>
          {statusLine && (
            <p
              className={cn(
                "truncate text-xs",
                selected ? "text-gray-500" : "text-white/70",
              )}
            >
              {statusLine}
            </p>
          )}
        </div>
      </div>

      {editMode && selected && onResizeClick && (
        <button
          type="button"
          data-testid="tile-resize-handle"
          aria-label={`Resize ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onResizeClick();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center",
            "cursor-pointer rounded-full bg-gray-900 text-white shadow-md",
            "hover:scale-110 transition-transform",
          )}
        >
          <Maximize2 size={12} />
        </button>
      )}
    </div>
  );
}
