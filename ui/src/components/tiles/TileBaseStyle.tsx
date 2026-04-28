import type { ReactNode } from "react";

export type EntitySize = "small" | "medium" | "large";

export interface TileBaseStyleProps {
  size: EntitySize;
  domain: string;
  isOn: boolean;
  icon: ReactNode;
  name: string;
  stateText: string;
  onClick?: () => void;
  /** Clicking the icon area may trigger a quick-toggle (e.g. light on/off). */
  onIconClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Unified visual shell for all entity tiles.
 *
 * Provides the structural DOM skeleton (data-attrs, slot areas) that the
 * design system will style in P1.3. No visual logic is implemented here —
 * only the structural contract.
 *
 * TODO(P1.3-impl): Implement color logic:
 *   - Off  → white bg + gray icon
 *   - On   → domain-specific fill (light=yellow, climate=orange, lock=green,
 *             cover=blue, camera=black-translucent)
 *   - dark: variants for all states
 */
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
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tile shell is a visual container; interactive role comes from inner elements
    <div
      data-tile
      data-size={size}
      data-on={isOn ? "true" : undefined}
      data-domain={domain}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={[
        "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl",
        // TODO(P1.3-impl): 关闭=白底+灰 icon / 开启=按 domain 填充色
        // TODO(P1.3-impl): dark: 暗色模式变体
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Icon slot */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: quick-toggle on icon area */}
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
        className="cursor-pointer"
      >
        {icon}
      </div>

      {/* Name + stateText slot */}
      <div data-tile-labels className="truncate">
        <p data-tile-name className="truncate text-sm font-medium leading-tight">
          {name}
        </p>
        <p data-tile-state className="truncate text-xs leading-tight opacity-60">
          {stateText}
        </p>
      </div>
    </div>
  );
}

/**
 * Returns the "on" background color token for a given domain.
 * Placeholder: all values are empty strings until P1.3 fills them in.
 *
 * TODO(P1.3-impl): return Tailwind class strings, e.g.
 *   "light"   → "bg-yellow-300"
 *   "climate" → "bg-orange-400"
 *   "lock"    → "bg-green-500"
 *   "cover"   → "bg-blue-400"
 *   "camera"  → "bg-black/70"
 */
export function getDomainOnColor(_domain: string): string {
  return "";
}
