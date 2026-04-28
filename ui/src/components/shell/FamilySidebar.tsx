import { AppSidebar, Tooltip } from "@tokimo/ui";
import { PanelLeft, PanelLeftClose, Plus, Settings } from "lucide-react";
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

function InstanceAvatar({
  name,
  colorIndex,
  status,
  size,
}: {
  name: string;
  colorIndex: number;
  status: ConnStatus;
  size: number;
}) {
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const initial = (name || "?")[0].toUpperCase();
  const fontSize = Math.max(11, Math.round(size * 0.45));
  return (
    <div className="relative inline-flex">
      <div
        className="flex items-center justify-center rounded-lg font-semibold text-white"
        style={{
          backgroundColor: color,
          width: size,
          height: size,
          fontSize,
        }}
      >
        {initial}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface-base,#0b0f17)] ${
          STATUS_DOT_COLORS[statusKey(status)]
        }`}
      />
    </div>
  );
}

interface FamilySidebarProps {
  instances: HaInstance[];
  activeId: string | null;
  collapsed: boolean;
  settingsActive: boolean;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
  onSettingsClick: () => void;
  onToggleCollapse: () => void;
  onContextMenuItem?: (id: string, e: React.MouseEvent) => void;
  t: (k: string) => string;
}

export function FamilySidebar({
  instances,
  activeId,
  collapsed,
  settingsActive,
  onSelect,
  onCreateClick,
  onSettingsClick,
  onToggleCollapse,
  onContextMenuItem,
  t,
}: FamilySidebarProps) {
  const sections = [
    {
      key: "instances",
      variant: "tall" as const,
      items: instances.map((inst, i) => ({
        key: inst.id,
        icon: (
          <InstanceAvatar
            name={inst.name}
            colorIndex={i}
            status={inst.status}
            size={28}
          />
        ),
        collapsedIcon: (
          <InstanceAvatar
            name={inst.name}
            colorIndex={i}
            status={inst.status}
            size={28}
          />
        ),
        label: inst.name,
        tooltip: inst.name,
        onContextMenu: onContextMenuItem
          ? (e: React.MouseEvent) => onContextMenuItem(inst.id, e)
          : undefined,
      })),
    },
  ];

  const collapsedFooter = (
    <div className="flex flex-col items-center gap-1">
      <Tooltip title={t("sidebarNewFamily")} placement="right">
        <button
          type="button"
          onClick={onCreateClick}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("sidebarSettings")} placement="right">
        <button
          type="button"
          onClick={onSettingsClick}
          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-all ${
            settingsActive
              ? "bg-black/[0.08] text-fg-primary dark:bg-white/[0.08]"
              : "text-fg-muted hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          }`}
        >
          <Settings className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("sidebarExpand")} placement="right">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );

  const fullFooter = (
    <div className="flex items-center gap-1">
      <Tooltip title={t("sidebarNewFamily")}>
        <button
          type="button"
          onClick={onCreateClick}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("sidebarSettings")}>
        <button
          type="button"
          onClick={onSettingsClick}
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all ${
            settingsActive
              ? "bg-black/[0.08] text-fg-primary dark:bg-white/[0.08]"
              : "text-fg-muted hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          }`}
        >
          <Settings className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("sidebarCollapse")}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <AppSidebar
      sections={sections}
      activeKey={activeId ?? undefined}
      onSelect={onSelect}
      collapsed={collapsed}
      footer={collapsed ? collapsedFooter : fullFooter}
    />
  );
}
