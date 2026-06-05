import {
  autoUpdate,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { cn } from "@tokimo/ui";
import {
  Cog,
  Eye,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Rows,
  Settings,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { HaRoom } from "../../types";
import { HomeSummary } from "./HomeSummary";

interface HomeMenuProps {
  /** Required for HomeSummary banner. Optional for legacy callers (H10 will
   *  remove the legacy HomeView entirely). */
  instanceId?: string;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onEditHomeView?: () => void;
  onReorderSections?: () => void;
  onOpenRoom: (roomId: string) => void;
  onRescan?: () => void;
  showAll?: boolean;
  onToggleShowAll?: () => void;
}

export function HomeMenu({
  instanceId,
  rooms,
  t,
  onOpenSettings,
  onEditHomeView,
  onReorderSections,
  onOpenRoom,
  onRescan,
  showAll,
  onToggleShowAll,
}: HomeMenuProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  const close = () => setOpen(false);
  const handle = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={t("menuOpen")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-fg-secondary transition hover:bg-white/[0.06]"
        {...getReferenceProps()}
      >
        <MoreHorizontal size={20} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={cn(
              "z-[9999] min-w-[260px] overflow-hidden rounded-xl",
              "border border-white/[0.08] bg-surface-raised",
              "py-1 text-fg-primary shadow-2xl",
            )}
            {...getFloatingProps()}
          >
            <div className="px-1 py-1">
              {instanceId && (
                <HomeSummary instanceId={instanceId} variant="menu" t={t} />
              )}
            </div>

            <div className="my-1 h-px bg-white/[0.08]" />

            <MenuItem
              icon={<Plus size={16} />}
              label={t("menuAddAccessory")}
              onClick={handle(() => {
                console.log("[HomeMenu] add accessory placeholder");
              })}
            />
            <MenuItem
              icon={<Settings size={16} />}
              label={t("menuHomeSettings")}
              onClick={handle(onOpenSettings)}
            />
            {onEditHomeView && (
              <MenuItem
                icon={<LayoutGrid size={16} />}
                label={t("menuEditHomeView")}
                onClick={handle(onEditHomeView)}
              />
            )}
            {onReorderSections && (
              <MenuItem
                icon={<Rows size={16} />}
                label={t("menuReorderSections")}
                onClick={handle(onReorderSections)}
              />
            )}
            <MenuItem
              icon={<Cog size={16} />}
              label={t("menuRoomSettings")}
              onClick={handle(() => {
                console.log("[HomeMenu] room settings placeholder");
              })}
            />
            <MenuItem
              icon={<Workflow size={16} />}
              label={t("menuAutomation")}
              onClick={handle(() => {
                console.log("[HomeMenu] automation placeholder");
              })}
            />
            {onRescan && (
              <MenuItem
                icon={<RefreshCw size={16} />}
                label={t("menuRescan")}
                onClick={handle(onRescan)}
              />
            )}
            {onToggleShowAll && (
              <MenuItem
                icon={showAll ? <EyeOff size={16} /> : <Eye size={16} />}
                label={showAll ? t("menuShowPriority") : t("menuShowAll")}
                onClick={handle(onToggleShowAll)}
              />
            )}

            {rooms.length > 0 && (
              <>
                <div className="my-1 h-px bg-white/[0.08]" />
                <div className="px-3 py-1 text-xs text-fg-muted">
                  {t("menuRoomsHeading")}
                </div>
                {rooms.map((room) => (
                  <MenuItem
                    key={room.id}
                    icon={<Pencil size={16} className="opacity-0" />}
                    label={room.name}
                    onClick={handle(() => onOpenRoom(room.id))}
                  />
                ))}
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
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
    </button>
  );
}
