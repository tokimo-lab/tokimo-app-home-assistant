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
import { MoreHorizontal, Settings } from "lucide-react";
import { useState } from "react";
import type { HaRoom } from "../../types";

interface HomeMenuProps {
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onOpenRoom: (roomId: string) => void;
}

export function HomeMenu({
  rooms,
  t,
  onOpenSettings,
  onOpenRoom,
}: HomeMenuProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(4), shift({ padding: 8 })],
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
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/[0.06]"
        {...getReferenceProps()}
      >
        <MoreHorizontal size={20} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 min-w-[220px] rounded-xl border border-white/[0.08] bg-[var(--surface-elevated,#1a1a1a)] py-1 text-[var(--text-primary)] shadow-2xl"
            {...getFloatingProps()}
          >
            <MenuItem
              icon={<Settings size={16} />}
              label={t("menuHomeSettings")}
              onClick={handle(onOpenSettings)}
            />

            {rooms.length > 0 && (
              <>
                <div className="my-1 h-px bg-white/[0.08]" />
                <div className="px-3 py-1 text-xs text-white/40">
                  {t("menuRoomsHeading")}
                </div>
                {rooms.map((room) => (
                  <MenuItem
                    key={room.id}
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
  icon?: React.ReactNode;
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
        <span className="flex h-4 w-4 items-center justify-center text-[var(--text-secondary)]">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
