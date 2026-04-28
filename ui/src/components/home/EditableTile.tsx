import { Maximize2, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { EntitySize, EntityState } from "../../types";

const SIZE_CYCLE: Record<EntitySize, EntitySize> = {
  small: "medium",
  medium: "large",
  large: "small",
};

interface EditableTileProps {
  entity: EntityState;
  editMode: boolean;
  /** Called with the next size when the user clicks the size cycle button. */
  onCycleSize?: (next: EntitySize) => void;
  /** Called with the next is_favorite value (true=add, false=remove). */
  onToggleFavorite?: (next: boolean) => void;
  /** Optional extra props forwarded to the outer wrapper (drag handle etc.). */
  outerProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Optional ref to the outer wrapper (for dnd-kit setNodeRef). */
  outerRef?: (node: HTMLElement | null) => void;
  outerStyle?: React.CSSProperties;
  /** Render extra overlays (e.g. drag handle) on top of the tile. */
  extraOverlay?: ReactNode;
  children: ReactNode;
  t: (k: string) => string;
}

/**
 * Wraps a tile with edit-mode chrome:
 *  - top-right round button cycles size: small → medium → large → small
 *  - top-left round button toggles favorite (+/−)
 *  - transparent overlay over the tile body to suppress its own click handler
 *  - subtle wiggle animation on the wrapper
 *
 * When `editMode` is false this wrapper renders children unchanged.
 */
export function EditableTile({
  entity,
  editMode,
  onCycleSize,
  onToggleFavorite,
  outerProps,
  outerRef,
  outerStyle,
  extraOverlay,
  children,
  t,
}: EditableTileProps) {
  if (!editMode) {
    return <>{children}</>;
  }

  const currentSize: EntitySize = entity.size ?? "small";
  const isFav = entity.is_favorite ?? false;

  return (
    <div
      ref={outerRef}
      style={outerStyle}
      className="relative h-full w-full animate-[ha-wiggle_0.4s_ease-in-out_infinite]"
      {...outerProps}
    >
      {children}

      {/* Click suppressor: covers tile body so taps don't trigger onCall. */}
      <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing rounded-[22px]" />

      {/* Favorite toggle (top-left) — only rendered when handler provided. */}
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(!isFav);
          }}
          aria-label={isFav ? t("removeFromFavorites") : t("addToFavorites")}
          title={isFav ? t("removeFromFavorites") : t("addToFavorites")}
          className="absolute left-1.5 top-1.5 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white shadow-md ring-1 ring-white/20 transition hover:bg-black/80"
        >
          {isFav ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      )}

      {/* Size cycle (top-right) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycleSize?.(SIZE_CYCLE[currentSize]);
        }}
        aria-label={`${t("tileSize")}: ${currentSize}`}
        title={`${t("tileSize")}: ${currentSize}`}
        className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white shadow-md ring-1 ring-white/20 transition hover:bg-black/80"
      >
        <Maximize2 size={12} />
      </button>

      {extraOverlay}
    </div>
  );
}
