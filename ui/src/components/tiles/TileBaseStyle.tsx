import { cn } from "@tokimo/ui";
import { motion } from "framer-motion";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useShellWindowDragDegraded } from "../../state/shellWindowDragDegrade";

const INNER_LAYOUT_TRANSITION = {
  type: "spring",
  stiffness: 220,
  damping: 28,
  mass: 1,
} as const;

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;

export type TileSize = "small" | "medium" | "large";

/**
 * AppleHome accent palette per IMG_2654.
 * Map domain -> active fill color. Domains absent from this map render as
 * "always-off" (sensor / binary_sensor stay gray regardless of state).
 */
export const TILE_ACCENT: Record<string, string> = {
  light: "#FFB800",
  climate: "#FF6B35",
  switch: "#34C759",
  outlet: "#34C759",
  input_boolean: "#34C759",
  lock: "#34C759",
  cover: "#0A84FF",
  fan: "#5AC8FA",
  media_player: "#FF2D55",
  scene: "#AF52DE",
  script: "#AF52DE",
  vacuum: "#34C759",
  camera: "#000000",
  automation: "#AF52DE",
};

const NEUTRAL_DOMAINS = new Set(["sensor", "binary_sensor"]);

export interface TileBaseStyleProps {
  /** Domain controls accent color via TILE_ACCENT map. */
  domain: string;
  /** Whether this tile is in its "active" state (lit / playing / locked / etc). */
  isOn: boolean;
  /** Optional explicit accent override (rarely needed; e.g. light-color sync). */
  accentColor?: string;
  /** Tile size: small/medium = icon top-left, large = icon centered. */
  size?: TileSize;

  icon: ReactNode;
  name: string;
  stateText?: string;

  /** Body click (whole tile). */
  onClick?: () => void;
  /** Icon-region click (used by tiles whose icon doubles as toggle). */
  onIconClick?: (e: ReactMouseEvent) => void;
  /** Long-press on body — used to open the entity detail overlay. */
  onLongPress?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;

  /** Extra background content (rendered behind labels), e.g. camera frame. */
  children?: ReactNode;
  className?: string;
}

function resolveAccent(domain: string, override?: string): string | undefined {
  if (override) return override;
  if (NEUTRAL_DOMAINS.has(domain)) return undefined;
  return TILE_ACCENT[domain];
}

/**
 * Visual layer of every HA tile (matches IMG_2654).
 *
 * Off state: white card (deep gray in dark mode), gray icon + gray labels.
 * On state : solid accent fill + white icon + white labels.
 *
 * Layout:
 * - small / medium → icon top-left, name+stateText bottom-left
 * - large          → icon centered, name+stateText centered below
 *
 * Accent is exposed as `--ha-tile-accent` so callers can read it for
 * inner highlights if desired.
 *
 * Interaction:
 * - tap/click on body → onClick (typically toggle)
 * - tap/click on icon region → onIconClick (also toggle)
 * - long-press on body (≥500ms, no movement) → onLongPress (open detail)
 *   The synthetic click that follows pointerup is suppressed so single-tap
 *   and long-press are mutually exclusive.
 */
export function TileBaseStyle({
  domain,
  isOn,
  accentColor,
  size = "small",
  icon,
  name,
  stateText,
  onClick,
  onIconClick,
  onLongPress,
  onContextMenu,
  children,
  className,
}: TileBaseStyleProps) {
  const accent = resolveAccent(domain, accentColor);
  const active = isOn && accent !== undefined;
  const isLarge = size === "large";
  const shellWindowDragActive = useShellWindowDragDegraded();
  // Disable Framer Motion projection during shell window drag so rAF layout
  // work does not compete with the shell drag loop.
  const layout = shellWindowDragActive ? false : "position";

  const style: CSSProperties | undefined = accent
    ? ({ "--ha-tile-accent": accent } as CSSProperties)
    : undefined;

  const pointerIdRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const movedRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelTimer(), [cancelTimer]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!onLongPress) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      pointerIdRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      longFiredRef.current = false;
      movedRef.current = false;
      cancelTimer();
      timerRef.current = setTimeout(() => {
        longFiredRef.current = true;
        timerRef.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [cancelTimer, onLongPress],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const start = startPosRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD_PX) {
        movedRef.current = true;
        cancelTimer();
      }
    },
    [cancelTimer],
  );

  const handlePointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      cancelTimer();
      pointerIdRef.current = null;
      startPosRef.current = null;
    },
    [cancelTimer],
  );

  const handleClick = useCallback(() => {
    if (longFiredRef.current || movedRef.current) {
      longFiredRef.current = false;
      movedRef.current = false;
      return;
    }
    onClick?.();
  }, [onClick]);

  const interactive = onClick || onLongPress;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: conditional role=button + onKeyDown applied below.
    <div
      data-tile
      data-size={size}
      data-on={active ? "true" : undefined}
      data-domain={domain}
      style={style}
      onClick={interactive ? handleClick : undefined}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerMove={onLongPress ? handlePointerMove : undefined}
      onPointerUp={onLongPress ? handlePointerEnd : undefined}
      onPointerCancel={onLongPress ? handlePointerEnd : undefined}
      onContextMenu={onContextMenu}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-2xl p-3 transition-colors",
        active
          ? "bg-[var(--ha-tile-accent)] text-white"
          : "bg-surface-raised text-fg-secondary",
        isLarge ? "items-center justify-center gap-2" : "justify-between",
        interactive &&
          "cursor-pointer select-none active:scale-[0.97] transition-transform",
        className,
      )}
    >
      {children}

      <motion.div
        layout={layout}
        transition={INNER_LAYOUT_TRANSITION}
        data-tile-icon
        onClick={
          onIconClick
            ? (e) => {
                e.stopPropagation();
                onIconClick(e);
              }
            : undefined
        }
        onKeyDown={
          onIconClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onIconClick(e as unknown as ReactMouseEvent);
                }
              }
            : undefined
        }
        tabIndex={onIconClick ? 0 : undefined}
        role={onIconClick ? "button" : undefined}
        className={cn(
          "relative z-10 flex items-center justify-center",
          isLarge ? "h-12 w-12" : "h-8 w-8 self-start",
          onIconClick &&
            "cursor-pointer rounded-full transition-shadow hover:ring-4 hover:ring-white/15",
          active ? "text-white" : "text-fg-secondary",
        )}
      >
        {icon}
      </motion.div>

      <motion.div
        layout={layout}
        transition={INNER_LAYOUT_TRANSITION}
        data-tile-labels
        className={cn(
          "relative z-10 min-w-0",
          isLarge ? "text-center" : "self-stretch",
        )}
      >
        <p
          data-tile-name
          className={cn(
            "truncate text-[15px] font-semibold leading-tight",
            active ? "text-white" : "text-fg-primary",
          )}
        >
          {name}
        </p>
        {stateText && (
          <p
            data-tile-state
            className={cn(
              "mt-0.5 truncate text-[13px] leading-tight",
              active ? "text-white/90" : "text-fg-secondary",
            )}
          >
            {stateText}
          </p>
        )}
      </motion.div>
    </div>
  );
}
