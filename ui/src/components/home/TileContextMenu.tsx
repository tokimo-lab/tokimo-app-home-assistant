import {
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import {
  Check,
  EyeOff,
  LayoutGrid,
  Sliders,
  Star,
  StarOff,
} from "lucide-react";
import { useLayoutEffect } from "react";
import type { EntitySize, EntityState } from "../../types";
import { effectiveSizeForEntity } from "./_helpers";

interface TileContextMenuProps {
  entity: EntityState;
  /** Viewport coordinates where the user right-clicked. */
  x: number;
  y: number;
  onClose: () => void;
  onShowControls: () => void;
  onSetSize: (size: EntitySize) => void;
  onToggleFavorite: (next: boolean) => void;
  onHide: () => void;
  /**
   * When provided, the "Similar Accessories" menu item is rendered. Caller
   * is responsible for only supplying this when the entity belongs to a
   * group with ≥2 members (gated by `useEntityAccessory` member count).
   */
  onShowSimilar?: () => void;
  t: (k: string) => string;
}

const SIZES: EntitySize[] = ["small", "medium", "large"];
const SIZE_LABEL_KEY: Record<EntitySize, string> = {
  small: "tileSizeSmall",
  medium: "tileSizeMedium",
  large: "tileSizeLarge",
};

/**
 * Right-click popover for a tile. Pinned to the cursor position via
 * a virtual reference element; closes on outside click / Esc.
 */
export function TileContextMenu({
  entity,
  x,
  y,
  onClose,
  onShowControls,
  onSetSize,
  onToggleFavorite,
  onHide,
  onShowSimilar,
  t,
}: TileContextMenuProps) {
  const currentSize: EntitySize = effectiveSizeForEntity(entity);
  const isFav = entity.is_favorite ?? false;

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    placement: "bottom-start",
    strategy: "fixed",
  });

  // Anchor at the click coordinates via a virtual reference rect.
  // Must be in useLayoutEffect — refs.setPositionReference internally calls
  // React setState and must not be called during render.
  useLayoutEffect(() => {
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    });
  }, [x, y, refs.setPositionReference]);

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const handle = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[9999] min-w-[180px] rounded-xl border border-white/[0.08] bg-surface-raised py-1 text-fg-primary shadow-2xl"
        {...getFloatingProps()}
      >
        {/* Show Controls — primary action, mirrors Apple Home */}
        <MenuItem
          icon={<Sliders size={16} />}
          label={t("showControls")}
          onClick={handle(onShowControls)}
        />

        <div className="my-1 h-px bg-white/[0.08]" />

        {/* Size selector */}
        <div className="px-3 py-1 text-xs text-fg-muted">
          {t("tileSizeHeading")}
        </div>
        {SIZES.map((s) => (
          <MenuItem
            key={s}
            label={t(SIZE_LABEL_KEY[s])}
            trailing={
              s === currentSize ? (
                <Check size={14} className="text-accent" />
              ) : null
            }
            onClick={handle(() => onSetSize(s))}
          />
        ))}

        <div className="my-1 h-px bg-white/[0.08]" />

        <MenuItem
          icon={isFav ? <StarOff size={16} /> : <Star size={16} />}
          label={isFav ? t("removeFromFavorites") : t("addToFavorites")}
          onClick={handle(() => onToggleFavorite(!isFav))}
        />

        {onShowSimilar && (
          <>
            <div className="my-1 h-px bg-white/[0.08]" />
            <MenuItem
              icon={<LayoutGrid size={16} />}
              label={t("tileContextMenuManageAccessory")}
              onClick={handle(onShowSimilar)}
            />
          </>
        )}

        <div className="my-1 h-px bg-white/[0.08]" />

        <MenuItem
          icon={<EyeOff size={16} />}
          label={t("hideEntity")}
          onClick={handle(onHide)}
        />
      </div>
    </FloatingPortal>
  );
}

function MenuItem({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
    >
      {icon && (
        <span className="flex h-4 w-4 items-center justify-center text-fg-secondary">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {trailing && <span className="ml-2 flex items-center">{trailing}</span>}
    </button>
  );
}
