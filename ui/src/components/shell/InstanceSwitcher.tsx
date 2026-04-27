import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import type { ConnStatus, HaInstance } from "../../types";

interface InstanceSwitcherProps {
  instances: HaInstance[];
  activeId: string | null;
  subPage: string;
  onSwitch: (instanceId: string, subPage: string) => void;
  onAddNew: () => void;
  t: (k: string) => string;
}

const STATUS_DOT: Record<ConnStatus, string> = {
  connected: "bg-green-400",
  disconnected: "bg-gray-500",
  connecting: "bg-yellow-400 animate-pulse",
  error: "bg-red-400",
};

export function InstanceSwitcher({
  instances,
  activeId,
  subPage,
  onSwitch,
  onAddNew,
  t,
}: InstanceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const active = instances.find((i) => i.id === activeId);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/[0.06] transition"
        onClick={() => setOpen((v) => !v)}
      >
        {active && (
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[active.status]}`}
          />
        )}
        <span className="flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {active?.name ?? t("noInstances")}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-white/10 bg-[var(--surface-elevated,#1f2937)] py-1 shadow-xl">
            {instances.map((inst) => (
              <button
                key={inst.id}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-white/[0.06] transition"
                onClick={() => {
                  onSwitch(inst.id, subPage);
                  setOpen(false);
                }}
              >
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[inst.status]}`}
                />
                <span className="flex-1 truncate text-[var(--text-primary)]">
                  {inst.name}
                </span>
                {inst.id === activeId && (
                  <Check size={14} className="text-[var(--accent)]" />
                )}
              </button>
            ))}
            <div className="mx-2 my-1 border-t border-white/10" />
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-white/[0.06] transition"
              onClick={() => {
                onAddNew();
                setOpen(false);
              }}
            >
              <Plus size={14} />
              {t("instancesAdd")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
