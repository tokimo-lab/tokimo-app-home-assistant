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
import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Home,
  LayoutGrid,
  Lightbulb,
  Moon,
  Plus,
  Squircle,
  Users,
} from "lucide-react";
import { useState } from "react";

interface AddMenuProps {
  /** HA base URL for the active instance (used to build deep links). */
  instanceBaseUrl: string;
  t: (k: string) => string;
  onAddRoom: () => void;
  onAddNewHome: () => void;
  onCreateTile: () => void;
}

/**
 * Apple-Home-style "+" menu in the home page header. Replaces the
 * single "Add Accessory" button with a 7-item add dropdown:
 * accessory / scene / automation / tile / room / people (soon) / new home.
 *
 * - accessory / scene / automation open the corresponding HA web-config
 *   dashboard in a new tab.
 * - tile (P8.3.2) opens a tokimo-side modal to build a manual accessory
 *   group from arbitrary entities.
 * - room / new home are tokimo-side flows wired by the parent.
 */
export function AddMenu({
  instanceBaseUrl,
  t,
  onAddRoom,
  onAddNewHome,
  onCreateTile,
}: AddMenuProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(8), shift({ padding: 8 })],
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

  const baseUrl = instanceBaseUrl ? instanceBaseUrl.replace(/\/$/, "") : "";
  const openHaPath = (path: string) => {
    if (!baseUrl) return;
    window.open(`${baseUrl}${path}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={t("homeAdd")}
        title={t("homeAdd")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] text-fg-primary transition hover:bg-white/[0.1]"
        {...getReferenceProps()}
      >
        <Plus size={20} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={cn(
              "z-[9999] min-w-[260px] overflow-hidden rounded-2xl",
              "border border-white/[0.06] bg-black/80 backdrop-blur-xl",
              "py-1 text-fg-primary shadow-2xl",
            )}
            {...getFloatingProps()}
          >
            <AddMenuItem
              icon={Lightbulb}
              label={t("addAccessory")}
              disabled={!baseUrl}
              onClick={handle(() =>
                openHaPath("/config/integrations/dashboard"),
              )}
            />
            <AddMenuItem
              icon={Moon}
              label={t("addScene")}
              disabled={!baseUrl}
              onClick={handle(() => openHaPath("/config/scene/dashboard"))}
            />
            <AddMenuItem
              icon={Clock}
              label={t("addAutomation")}
              disabled={!baseUrl}
              onClick={handle(() => openHaPath("/config/automation/dashboard"))}
            />
            <AddMenuItem
              icon={Squircle}
              label={t("createTile")}
              onClick={handle(onCreateTile)}
            />
            <AddMenuItem
              icon={LayoutGrid}
              label={t("addRoom")}
              onClick={handle(onAddRoom)}
            />
            <AddMenuItem
              icon={Users}
              label={t("addPeople")}
              disabled
              hint={t("comingSoon")}
            />
            <AddMenuItem
              icon={Home}
              label={t("addNewHome")}
              onClick={handle(onAddNewHome)}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function AddMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={hint}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 text-left text-[15px]",
        "h-[50px] transition",
        disabled || !onClick
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:bg-white/[0.06]",
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      <Icon size={22} className="shrink-0 text-fg-secondary" />
    </button>
  );
}
