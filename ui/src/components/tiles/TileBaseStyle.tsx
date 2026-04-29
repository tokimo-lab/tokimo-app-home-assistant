import { cn } from "@tokimo/ui";
import type { ReactNode } from "react";

export type EntitySize = "small" | "medium" | "large";

export interface TileBaseStyleProps {
  size?: EntitySize;
  domain: string;
  isOn: boolean;
  icon: ReactNode;
  name: string;
  stateText: string;
  onClick?: () => void;
  onIconClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

function domainOnBg(domain: string): string {
  const map: Record<string, string> = {
    light: "bg-amber-400 dark:bg-amber-400",
    switch: "bg-blue-500 dark:bg-blue-500",
    input_boolean: "bg-blue-500 dark:bg-blue-500",
    fan: "bg-sky-400 dark:bg-sky-400",
    cover: "bg-sky-400 dark:bg-sky-400",
    climate: "bg-orange-400 dark:bg-orange-400",
    lock: "bg-emerald-500 dark:bg-emerald-500",
    media_player: "bg-violet-500 dark:bg-violet-500",
    scene: "bg-purple-500 dark:bg-purple-500",
    script: "bg-indigo-500 dark:bg-indigo-500",
    sensor: "bg-gray-500 dark:bg-gray-500",
    binary_sensor: "bg-orange-500 dark:bg-orange-500",
    camera: "bg-black/80 dark:bg-black/80",
    vacuum: "bg-emerald-500 dark:bg-emerald-500",
    automation: "bg-amber-500 dark:bg-amber-500",
  };
  return map[domain] ?? "bg-gray-500 dark:bg-gray-500";
}

export function TileBaseStyle({
  size,
  domain,
  isOn,
  icon,
  name,
  stateText,
  onClick,
  onIconClick,
  onContextMenu,
  className,
}: TileBaseStyleProps) {
  const isLarge = (size ?? "small") === "large";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: has conditional role=button + onKeyDown
    <div
      data-tile
      data-size={size}
      data-on={isOn ? "true" : undefined}
      data-domain={domain}
      onContextMenu={onContextMenu}
      onClick={onClick}
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
        "relative flex h-full w-full overflow-hidden rounded-2xl transition-colors",
        // Off state
        !isOn && "bg-white dark:bg-zinc-800",
        !isOn && "border border-black/[0.04] dark:border-white/[0.06]",
        !isOn && "text-zinc-500 dark:text-zinc-400",
        // On state
        isOn && domainOnBg(domain),
        isOn && "text-white",
        // Layout
        isLarge
          ? "flex-col items-center justify-center gap-3 p-4"
          : "flex-col justify-between p-3",
        onClick && "cursor-pointer active:scale-[0.97] transition-transform",
        className,
      )}
    >
      {/* Icon slot */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: has conditional role=button + onKeyDown */}
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
                  e.currentTarget.click();
                }
              }
            : undefined
        }
        tabIndex={onIconClick ? 0 : undefined}
        role={onIconClick ? "button" : undefined}
        className={cn(
          onIconClick && "cursor-pointer",
          isLarge && "flex items-center justify-center",
        )}
      >
        {icon}
      </div>

      {/* Name + stateText slot */}
      <div
        data-tile-labels
        className={cn("truncate", isLarge && "text-center")}
      >
        <p
          data-tile-name
          className="truncate text-sm font-medium leading-tight"
        >
          {name}
        </p>
        <p
          data-tile-state
          className="truncate text-xs leading-tight opacity-70"
        >
          {stateText}
        </p>
      </div>
    </div>
  );
}
