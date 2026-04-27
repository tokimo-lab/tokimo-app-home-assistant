import { Plus, Settings } from "lucide-react";
import type { ConnStatus, HaInstance } from "../../types";

const AVATAR_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
];

const STATUS_DOT_COLORS: Record<
  "connected" | "disconnected" | "connecting" | "error",
  string
> = {
  connected: "bg-green-400",
  disconnected: "bg-gray-400",
  connecting: "bg-yellow-400 animate-pulse",
  error: "bg-red-400",
};

function statusKey(
  status: ConnStatus,
): "connected" | "disconnected" | "connecting" | "error" {
  return typeof status === "string" ? status : "error";
}

function StatusDot({ status }: { status: ConnStatus }) {
  const key = statusKey(status);
  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-base,#0b0f17)] ${STATUS_DOT_COLORS[key]}`}
    />
  );
}

interface InstanceAvatarStripProps {
  instances: HaInstance[];
  activeInstanceId: string | null;
  connStatus: ConnStatus;
  isManaging: boolean;
  onSelectInstance: (id: string) => void;
  onManageInstances: () => void;
  onOpenSettings: () => void;
  onContextMenuInstance: (id: string) => void;
  t: (k: string) => string;
}

export function InstanceAvatarStrip({
  instances,
  activeInstanceId,
  connStatus,
  isManaging,
  onSelectInstance,
  onManageInstances,
  onOpenSettings,
  onContextMenuInstance,
  t,
}: InstanceAvatarStripProps) {
  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-white/[0.08] bg-black/[0.15] py-2">
      <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {instances.map((inst, i) => {
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const isActive = inst.id === activeInstanceId && !isManaging;
          const initial = (inst.name || "?")[0].toUpperCase();
          const liveStatus = isActive ? connStatus : inst.status;

          return (
            <button
              key={inst.id}
              type="button"
              title={inst.name}
              onClick={() => onSelectInstance(inst.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenuInstance(inst.id);
              }}
              className={`relative flex size-10 cursor-pointer items-center justify-center rounded-xl transition-all ${
                isActive
                  ? "bg-white/[0.08] ring-2 ring-[var(--accent,#6366f1)]"
                  : "hover:bg-white/[0.06]"
              }`}
            >
              <div
                className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {initial}
              </div>
              <StatusDot status={liveStatus} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1 pt-2">
        {instances.length > 0 && (
          <button
            type="button"
            title={t("settingsTitle")}
            onClick={onOpenSettings}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-[var(--text-muted,#9ca3af)] transition-all hover:bg-white/[0.08] hover:text-[var(--text-secondary)]"
          >
            <Settings className="size-4" />
          </button>
        )}
        <button
          type="button"
          title={
            instances.length === 0 ? t("addInstance") : t("manageInstances")
          }
          onClick={onManageInstances}
          className={`flex size-9 cursor-pointer items-center justify-center rounded-lg transition-all ${
            isManaging
              ? "bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent,#6366f1)]"
              : "text-[var(--text-muted,#9ca3af)] hover:bg-white/[0.08] hover:text-[var(--text-secondary)]"
          }`}
        >
          {instances.length === 0 ? (
            <Plus className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
