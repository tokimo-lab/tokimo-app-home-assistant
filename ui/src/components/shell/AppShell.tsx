import type { ReactNode } from "react";
import type { ConnStatus, HaInstance, SubPage } from "../../types";
import { InstanceAvatarStrip } from "./InstanceAvatarStrip";

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
  const isManaging = subPage === "instances";

  return (
    <div className="flex h-full w-full overflow-hidden">
      <InstanceAvatarStrip
        instances={instances}
        activeInstanceId={activeInstanceId}
        connStatus={connStatus}
        isManaging={isManaging}
        onSelectInstance={(id) => onNavigate(`/instance/${id}/home`)}
        onManageInstances={onNavigateToInstances}
        t={t}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
