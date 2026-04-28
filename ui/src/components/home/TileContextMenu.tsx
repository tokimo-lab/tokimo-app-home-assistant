import {
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { Check, EyeOff, Star, StarOff } from "lucide-react";
import type { EntitySize, EntityState } from "../../types";

interface TileContextMenuProps {
  entity: EntityState;
  /** Viewport coordinates where the user right-clicked. */
  x: number;
  y: number;
  onClose: () => void;
  onSetSize: (size: EntitySize) => void;
  onToggleFavorite: (next: boolean) => void;
  onHide: () => void;
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
  onSetSize,
  onToggleFavorite,
  onHide,
  t,
}: TileContextMenuProps) {
  const currentSize: EntitySize = entity.size ?? "small";
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
        className="z-[9999] min-w-[180px] rounded-xl border border-white/[0.08] bg-[var(--surface-elevated,#1a1a1a)] py-1 text-[var(--text-primary)] shadow-2xl"
        {...getFloatingProps()}
      >
        {/* Size selector */}
        <div className="px-3 py-1 text-xs text-white/40">
          {t("tileSizeHeading")}
        </div>
        {SIZES.map((s) => (
          <MenuItem
            key={s}
            label={t(SIZE_LABEL_KEY[s])}
            trailing={
              s === currentSize ? (
                <Check size={14} className="text-[var(--accent,#6366f1)]" />
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
        <span className="flex h-4 w-4 items-center justify-center text-[var(--text-secondary)]">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {trailing && <span className="ml-2 flex items-center">{trailing}</span>}
    </button>
  );
}
