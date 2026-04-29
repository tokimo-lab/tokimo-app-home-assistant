import { cn } from "@tokimo/ui";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

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
  onContextMenu,
  children,
  className,
}: TileBaseStyleProps) {
  const accent = resolveAccent(domain, accentColor);
  const active = isOn && accent !== undefined;
  const isLarge = size === "large";

  const style: CSSProperties | undefined = accent
    ? ({ "--ha-tile-accent": accent } as CSSProperties)
    : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: conditional role=button + onKeyDown applied below.
    <div
      data-tile
      data-size={size}
      data-on={active ? "true" : undefined}
      data-domain={domain}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-2xl p-3 transition-colors",
        active
          ? "bg-[var(--ha-tile-accent)] text-white"
          : "bg-white text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
        isLarge ? "items-center justify-center gap-2" : "justify-between",
        onClick &&
          "cursor-pointer select-none active:scale-[0.97] transition-transform",
        className,
      )}
    >
      {children}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: conditional role=button + onKeyDown applied below. */}
      <div
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
          onIconClick && "cursor-pointer",
          active ? "text-white" : "text-gray-400 dark:text-gray-400",
        )}
      >
        {icon}
      </div>

      <div
        data-tile-labels
        className={cn(
          "relative z-10 min-w-0",
          isLarge ? "text-center" : "self-stretch",
        )}
      >
        <p
          data-tile-name
          className={cn(
            "truncate text-sm font-semibold leading-tight",
            active ? "text-white" : "text-gray-700 dark:text-gray-200",
          )}
        >
          {name}
        </p>
        {stateText && (
          <p
            data-tile-state
            className={cn(
              "mt-0.5 truncate text-xs leading-tight",
              active ? "text-white/85" : "text-gray-500 dark:text-gray-400",
            )}
          >
            {stateText}
          </p>
        )}
      </div>
    </div>
  );
}
