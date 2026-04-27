import { LayoutGrid, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { ConnStatus, HaInstance, SubPage } from "../../types";
import { ConnectionBadge } from "./ConnectionBadge";
import { InstanceSwitcher } from "./InstanceSwitcher";

interface NavItem {
  id: SubPage;
  icon: React.FC<{ size?: number }>;
  labelKey: string;
}

// TODO R9p: sidebar redesign — re-introduce richer nav (rooms / devices / settings).
const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: LayoutGrid, labelKey: "navHome" },
];

interface AppShellProps {
  instances: HaInstance[];
  activeInstanceId: string | null;
  subPage: SubPage | "instances";
  connStatus: ConnStatus;
  children: ReactNode;
  t: (k: string) => string;
  onNavigate: (path: string) => void;
  onNavigateToInstances: () => void;
}

export function AppShell({
  instances,
  activeInstanceId,
  subPage,
  connStatus,
  children,
  t,
  onNavigate,
  onNavigateToInstances,
}: AppShellProps) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-[200px] flex-shrink-0 flex-col border-r border-white/[0.08] bg-black/[0.15]">
        {/* Instance switcher */}
        <div className="border-b border-white/[0.08] p-2">
          <InstanceSwitcher
            instances={instances}
            activeId={activeInstanceId}
            subPage={subPage === "instances" ? "home" : subPage}
            onSwitch={(id, sp) => onNavigate(`/instance/${id}/${sp}`)}
            onAddNew={onNavigateToInstances}
            t={t}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto p-2">
          {NAV_ITEMS.map(({ id, icon: Icon, labelKey }) => {
            const active = subPage === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!activeInstanceId}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent,#6366f1)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
                onClick={() => {
                  if (activeInstanceId) {
                    onNavigate(`/instance/${activeInstanceId}/${id}`);
                  }
                }}
              >
                <Icon size={16} />
                {t(labelKey)}
              </button>
            );
          })}
        </nav>

        {/* Bottom: connections + status */}
        <div className="border-t border-white/[0.08] p-2">
          <button
            type="button"
            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              subPage === "instances"
                ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-medium"
                : "text-[var(--text-secondary)] hover:bg-white/[0.06]"
            }`}
            onClick={onNavigateToInstances}
          >
            <Settings size={16} />
            {t("navInstances")}
          </button>
          {activeInstanceId && <ConnectionBadge status={connStatus} t={t} />}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
