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
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { HaInstance, HaRoom } from "../../types";
import { AddMenu } from "./AddMenu";
import { HomeMenu } from "./HomeMenu";

export interface HomePageHeaderProps {
  title: string;
  instanceId: string;
  instanceBaseUrl: string;
  rooms: HaRoom[];
  instances: HaInstance[];
  currentInstanceId: string;
  onSwitchInstance: (id: string) => void;
  t: (k: string) => string;
  onOpenSettings: () => void;
  onAddRoom: () => void;
  onAddNewHome: () => void;
  onEnterEditMode: () => void;
  onEnterReorderSections: () => void;
  onOpenRoom: (id: string) => void;
  onRescan?: () => void;
}

/**
 * Apple-Home-style top bar:
 *   left  – home name (bold, large) + ChevronDown for switching homes
 *           (chevron + dropdown only render when ≥ 2 instances exist)
 *   right – round [+] add menu + round [⋯] menu button
 */
export function HomePageHeader({
  title,
  instanceId,
  instanceBaseUrl,
  rooms,
  instances,
  currentInstanceId,
  onSwitchInstance,
  t,
  onOpenSettings,
  onAddRoom,
  onAddNewHome,
  onEnterEditMode,
  onEnterReorderSections,
  onOpenRoom,
  onRescan,
}: HomePageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <HomeSwitcher
        title={title}
        instances={instances}
        currentInstanceId={currentInstanceId}
        onSwitchInstance={onSwitchInstance}
        t={t}
      />
      <div className="flex items-center gap-2">
        <AddMenu
          instanceBaseUrl={instanceBaseUrl}
          t={t}
          onAddRoom={onAddRoom}
          onAddNewHome={onAddNewHome}
        />
        <HomeMenu
          instanceId={instanceId}
          rooms={rooms}
          t={t}
          onOpenSettings={onOpenSettings}
          onEditHomeView={onEnterEditMode}
          onReorderSections={onEnterReorderSections}
          onOpenRoom={onOpenRoom}
          onRescan={onRescan}
        />
      </div>
    </div>
  );
}

interface HomeSwitcherProps {
  title: string;
  instances: HaInstance[];
  currentInstanceId: string;
  onSwitchInstance: (id: string) => void;
  t: (k: string) => string;
}

function HomeSwitcher({
  title,
  instances,
  currentInstanceId,
  onSwitchInstance,
  t,
}: HomeSwitcherProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
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

  // Single instance (or none): no chevron, no dropdown — plain title text.
  if (instances.length <= 1) {
    return (
      <span className="text-3xl font-bold leading-tight text-[var(--text-primary)]">
        {title}
      </span>
    );
  }

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={t("homeSwitch")}
        title={t("homeSwitchTitle")}
        className="flex cursor-pointer items-center gap-1 text-[var(--text-primary)] transition hover:opacity-80"
        {...getReferenceProps()}
      >
        <span className="text-3xl font-bold leading-tight">{title}</span>
        <ChevronDown size={22} className="text-[var(--text-secondary)]" />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={cn(
              "z-[9999] min-w-[220px] overflow-hidden rounded-xl",
              "border border-white/[0.08] bg-[var(--surface-elevated,#1a1a1a)]",
              "py-1 text-[var(--text-primary)] shadow-2xl",
            )}
            {...getFloatingProps()}
          >
            <div className="px-3 py-1 text-xs text-white/40">
              {t("homeSwitchTitle")}
            </div>
            {instances.map((inst) => {
              const active = inst.id === currentInstanceId;
              return (
                <button
                  key={inst.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onSwitchInstance(inst.id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-[var(--accent,#18b2a4)]">
                    {active ? <Check size={16} /> : null}
                  </span>
                  <span className="flex-1 truncate">{inst.name}</span>
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
