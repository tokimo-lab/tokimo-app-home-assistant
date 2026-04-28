import type { ReactNode } from "react";
import { useContainerWidth } from "../../hooks/use-container-width";
import { useSidebarCollapsed } from "../../hooks/use-sidebar-collapsed";
import type { HaInstance } from "../../types";
import { FamilySidebar } from "./FamilySidebar";

interface AppShellProps {
  instances: HaInstance[];
  activeInstanceId: string | null;
  settingsActive: boolean;
  children: ReactNode;
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
  onCreateInstance: () => void;
  onContextMenuInstance: (id: string, e: React.MouseEvent) => void;
}

export function AppShell({
  instances,
  activeInstanceId,
  settingsActive,
  children,
  onNavigate,
  onOpenSettings,
  onCreateInstance,
  onContextMenuInstance,
}: AppShellProps) {
  const [containerRef, containerWidth] = useContainerWidth();
  const { collapsed, onToggleCollapse } = useSidebarCollapsed(
    "home-assistant",
    containerWidth > 0 && containerWidth < 720,
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full overflow-hidden"
    >
      <FamilySidebar
        instances={instances}
        activeId={activeInstanceId}
        collapsed={collapsed}
        settingsActive={settingsActive}
        onSelect={(id) => onNavigate(`/instance/${id}/home`)}
        onCreateClick={onCreateInstance}
        onSettingsClick={onOpenSettings}
        onToggleCollapse={onToggleCollapse}
        onContextMenuItem={onContextMenuInstance}
      />
      <main className="relative flex-1 overflow-auto">{children}</main>
    </div>
  );
}
