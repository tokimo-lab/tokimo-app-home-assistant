import {
  type AppRuntimeCtx,
  type Dispose,
  defineApp,
  makeTranslator,
} from "@tokimo/sdk";
import { useShellWindowNav } from "@tokimo/sdk/react";
import {
  AppSetupGuide,
  ConfigProvider,
  ToastProvider,
  enUS as uiEnUS,
  zhCN as uiZhCN,
} from "@tokimo/ui";
import { Home, Lock, Sparkles, Users } from "lucide-react";
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DetailOverlay } from "./components/detail/DetailOverlay";
import { HomePage } from "./components/home/HomePage";
import { RoomPageHost } from "./components/room/RoomPageHost";
import { HomeSettingsPage } from "./components/settings/HomeSettingsPage";
import {
  SettingsPane,
  type SettingsTab,
} from "./components/settings/SettingsPane";
import { AnimatedSettingsPane } from "./components/shell/AnimatedSettingsPane";
import { HomeAssistantMenuBar } from "./components/shell/HomeAssistantMenuBar";
import { enUS, zhCN } from "./i18n";
// @ts-expect-error -- side-effect css import
import "./index.css";
import { EntityManagementHost } from "./pages/EntityManagementHost";
import { SetupPage } from "./pages/SetupPage";
import { setActiveInstance } from "./state/activeInstanceStore";
import {
  ShellWindowDragDegradeProvider,
  useShellWindowDragDegrade,
} from "./state/shellWindowDragDegrade";
import { useCallService } from "./state/useCallService";
import {
  registerOpenInNewWindow,
  useDetailOverlay,
} from "./state/useDetailOverlay";
import { useEntities } from "./state/useEntities";
import { closeEntityMgmt } from "./state/useEntityMgmtNav";
import { useInstances } from "./state/useInstances";
import { clearRoomStack, pushRoom } from "./state/useRoomNav";
import { useRooms } from "./state/useRooms";
import type { ParsedRoute } from "./types";

const ACTIVE_INSTANCE_LS_KEY = "ha:active_instance_id";

function readPreferredInstanceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_INSTANCE_LS_KEY);
  } catch {
    return null;
  }
}

function writePreferredInstanceId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_INSTANCE_LS_KEY, id);
  } catch {
    // ignore — localStorage may be disabled
  }
}

function parseRoute(route: string): ParsedRoute {
  if (route === "/welcome") return { page: "welcome" };
  if (route === "/setup") return { page: "setup" };
  const home = route.match(/^\/instance\/([^/]+)\/home$/);
  if (home) return { page: "home", instanceId: home[1] };
  // Backward-compat: redirect old /rooms, /devices, and /room/:id routes to /home.
  // Rooms are now an in-memory push-stack via useRoomNav, not URL-driven.
  const legacy = route.match(/^\/instance\/([^/]+)\/(rooms|devices|room)/);
  if (legacy) return { page: "home", instanceId: legacy[1] };
  return { page: "root" };
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}

function HomeAssistantApp({ ctx }: { ctx: AppRuntimeCtx }) {
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, ctx.locale),
    [ctx.locale],
  );

  const nav = useShellWindowNav(ctx);
  const shellWindowDragActive = useShellWindowDragDegrade(ctx);
  const { route } = nav;
  const parsed = useMemo(() => parseRoute(route), [route]);

  const instanceId =
    parsed.page === "home" ? (parsed.instanceId ?? null) : null;

  // ── Instances ────────────────────────────────────────────────────────────
  const {
    instances,
    loading: instancesLoading,
    reload: reloadInstances,
  } = useInstances();

  const effectiveInstanceId = instanceId ?? instances[0]?.id ?? null;

  // ── Live entity stream ───────────────────────────────────────────────────
  // Drives the SSE lifecycle; entity reads use fine-grained hooks
  // (useEntity / useCollectionIndex / useEntitiesMap) further down.
  useEntities(instanceId);

  // ── Service calls (optimistic-UI) ────────────────────────────────────────
  const { call: onCall, getPending } = useCallService(instanceId, ctx);

  // ── Rooms (for HomePage grouping + room stack navigation) ────────────────
  const { rooms } = useRooms(instanceId);

  // ── Detail overlay state ─────────────────────────────────────────────────
  const { closeDetail, openInNewWindow } = useDetailOverlay();

  // ── Settings pane (Family settings) ──────────────────────────────────────
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [settingsTargetId, setSettingsTargetId] = useState<string | null>(null);
  const [homeSettingsInstanceId, setHomeSettingsInstanceId] = useState<
    string | null
  >(null);
  const openSettings = (opts: { tab: SettingsTab; instanceId?: string }) => {
    const targetId = opts.instanceId ?? effectiveInstanceId;
    setSettingsTargetId(targetId);
    setSettingsTab(opts.tab);
  };
  const closeSettings = () => {
    setSettingsTab(null);
    setSettingsTargetId(null);
  };
  const openHomeSettings = (id: string) => setHomeSettingsInstanceId(id);
  const closeHomeSettings = () => setHomeSettingsInstanceId(null);

  // ── Sync activeInstanceStore + reset transient stacks on instance change ─
  useEffect(() => {
    const inst = instances.find((i) => i.id === instanceId);
    setActiveInstance(instanceId, inst?.name ?? null);
    if (instanceId) writePreferredInstanceId(instanceId);
    // Switching home/family invalidates any pushed rooms or open detail card.
    clearRoomStack();
    closeEntityMgmt();
    closeDetail();
  }, [instanceId, instances, closeDetail]);

  // ── Switch home (used by HomePageHeader dropdown) ────────────────────────
  const handleSwitchInstance = useCallback(
    (id: string) => {
      const inst = instances.find((i) => i.id === id);
      if (!inst) return;
      writePreferredInstanceId(id);
      nav.navigate(`/instance/${id}/home`, `${inst.name} · ${t("navHome")}`);
    },
    [instances, nav, t],
  );

  // ── Wire DetailOverlay's "open in new window" to ShellApi.openModalWindow ─
  // The desktop shell's openModalWindow is now a typed first-class API on
  // `ctx.shell`; wire DetailOverlay's escape-hatch directly to it. The host
  // owns title rendering, close logic, and parent-window lookup.
  useEffect(() => {
    registerOpenInNewWindow(({ entityId, instanceId: iid }) => {
      ctx.shell.openModalWindow({
        component: () => import("./components/settings/AccessorySettingsPage"),
        title: t("detailOpenSettings"),
        width: 500,
        height: 600,
        metadata: { instanceId: iid, entityId, locale: ctx.locale },
      });
    });
    return () => {
      registerOpenInNewWindow(null);
    };
  }, [ctx, t]);

  // ── MenuBar ──────────────────────────────────────────────────────────────
  // Configured inside <HomeAssistantMenuBar> wrapper below.

  // ── Redirect from "/" ────────────────────────────────────────────────────
  useEffect(() => {
    if (parsed.page !== "root") return;
    if (instancesLoading) return;
    if (instances.length === 0) {
      nav.replace("/welcome", "Home Assistant");
    } else {
      // Prefer last-used instance from localStorage when available.
      const preferredId = readPreferredInstanceId();
      const target =
        (preferredId && instances.find((i) => i.id === preferredId)) ||
        instances[0];
      nav.replace(
        `/instance/${target.id}/home`,
        `${target.name} · ${t("navHome")}`,
      );
    }
  }, [parsed.page, instances, instancesLoading, nav, t]);

  // ── Reconcile stale instanceId in URL ────────────────────────────────────
  useEffect(() => {
    if (parsed.page !== "home") return;
    if (instancesLoading) return;
    if (!instanceId) return;
    if (instances.some((i) => i.id === instanceId)) return;
    if (instances.length === 0) {
      nav.replace("/welcome", "Home Assistant");
    } else {
      const first = instances[0];
      nav.replace(
        `/instance/${first.id}/home`,
        `${first.name} · ${t("navHome")}`,
      );
    }
  }, [parsed.page, instanceId, instances, instancesLoading, nav, t]);

  // ── Navigate helpers ─────────────────────────────────────────────────────
  function navigateTo(path: string) {
    const r = parseRoute(path);
    let title = "Home Assistant";
    if (r.page === "setup") title = t("setupTitle");
    else if (r.page === "welcome") title = "Home Assistant";
    else if (r.page === "home") {
      const inst = instances.find((i) => i.id === r.instanceId);
      title = inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant";
    }
    nav.navigate(path, title);
  }

  function handleFamilyCreated(created: import("./types").HaInstance) {
    void reloadInstances();
    nav.navigate(
      `/instance/${created.id}/home`,
      `${created.name} · ${t("navHome")}`,
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (parsed.page === "root") {
    return <Spinner />;
  }

  if (parsed.page === "welcome") {
    return (
      <AppSetupGuide
        accentColor="indigo"
        icon={Home}
        gradientClassName="from-indigo-400 via-purple-500 to-pink-500"
        title={t("welcomeTitle")}
        description={t("welcomeSlogan")}
        features={[
          { icon: Sparkles, label: t("welcomeFeatureControl") },
          { icon: Lock, label: t("welcomeFeatureLocal") },
          { icon: Users, label: t("welcomeFeatureMulti") },
        ]}
        actionLabel={t("welcomeCta")}
        onAction={() => navigateTo("/setup")}
      />
    );
  }

  if (parsed.page === "setup") {
    return (
      <SetupPage
        t={t}
        onCreated={handleFamilyCreated}
        onBack={
          instances.length > 0
            ? () => {
                const preferredId = readPreferredInstanceId();
                const target =
                  (preferredId &&
                    instances.find((i) => i.id === preferredId)) ||
                  instances[0];
                nav.replace(
                  `/instance/${target.id}/home`,
                  `${target.name} · ${t("navHome")}`,
                );
              }
            : () => nav.replace("/welcome", "Home Assistant")
        }
      />
    );
  }

  const activeInstance = instances.find((i) => i.id === instanceId) ?? null;

  return (
    <HomeAssistantMenuBar
      ctx={ctx}
      instances={instances}
      t={t}
      reloadInstances={reloadInstances}
    >
      <ShellWindowDragDegradeProvider active={shellWindowDragActive}>
        <div className="relative h-full w-full overflow-hidden">
          {parsed.page === "home" && activeInstance && (
            <>
              <HomePage
                instance={activeInstance}
                rooms={rooms}
                instances={instances}
                onSwitchInstance={handleSwitchInstance}
                ctx={ctx}
                getPending={getPending}
                onCall={onCall}
                onOpenRoom={(roomId) => {
                  pushRoom(roomId);
                }}
                onOpenSettings={() => openSettings({ tab: "family" })}
                onAddRoom={() => openHomeSettings(activeInstance.id)}
                onAddNewHome={() => navigateTo("/setup")}
                t={t}
              />
              <RoomPageHost
                instance={activeInstance}
                rooms={rooms}
                ctx={ctx}
                getPending={getPending}
                onCall={onCall}
                t={t}
              />
              <EntityManagementHost instance={activeInstance} ctx={ctx} t={t} />
              <DetailOverlay
                onCall={onCall}
                getPending={getPending}
                onOpenSettings={(eid) => {
                  if (!activeInstance) return;
                  openInNewWindow(eid, activeInstance.id);
                  closeDetail();
                }}
                t={t}
              />
            </>
          )}

          <AnimatedSettingsPane open={settingsTab !== null}>
            {settingsTab !== null && (
              <SettingsPane
                instance={
                  settingsTargetId
                    ? (instances.find((i) => i.id === settingsTargetId) ?? null)
                    : null
                }
                onClose={closeSettings}
                onInstanceUpdated={() => void reloadInstances()}
                onInstanceDeleted={() => {
                  const deletedId = settingsTargetId;
                  closeSettings();
                  void reloadInstances();
                  const remaining = instances.filter((i) => i.id !== deletedId);
                  if (remaining.length > 0) {
                    navigateTo(`/instance/${remaining[0].id}/home`);
                  } else {
                    nav.replace("/welcome", "Home Assistant");
                  }
                }}
                t={t}
              />
            )}
          </AnimatedSettingsPane>

          <AnimatedSettingsPane open={homeSettingsInstanceId !== null}>
            {homeSettingsInstanceId !== null && (
              <HomeSettingsPage
                instanceId={homeSettingsInstanceId}
                onClose={closeHomeSettings}
                onBack={closeHomeSettings}
                t={t}
              />
            )}
          </AnimatedSettingsPane>
        </div>
      </ShellWindowDragDegradeProvider>
    </HomeAssistantMenuBar>
  );
}

export default defineApp({
  id: "home-assistant",
  manifest: {
    id: "home-assistant",
    appName: "Home Assistant",
    icon: "Home",
    image: "icon.png",
    color: "#18b2a4",
    windowType: "home-assistant",
    defaultSize: { width: 1200, height: 740 },
    category: "app",
  },
  translations: { "zh-CN": zhCN, "en-US": enUS },
  mount(container, ctx): Dispose {
    const root: Root = createRoot(container);
    const locale = ctx.locale.startsWith("zh") ? uiZhCN : uiEnUS;
    root.render(
      <StrictMode>
        <ConfigProvider locale={locale}>
          <ToastProvider>
            <HomeAssistantApp ctx={ctx} />
          </ToastProvider>
        </ConfigProvider>
      </StrictMode>,
    );
    return () => root.unmount();
  },
});
