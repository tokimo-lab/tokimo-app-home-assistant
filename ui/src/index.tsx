import {
  type AppRuntimeCtx,
  type Dispose,
  defineApp,
  type MenuBarConfig,
  makeTranslator,
} from "@tokimo/sdk";
import { useShellMenuBar, useShellWindowNav } from "@tokimo/sdk/react";
import {
  ConfigProvider,
  ToastProvider,
  enUS as uiEnUS,
  zhCN as uiZhCN,
} from "@tokimo/ui";
import { StrictMode, useEffect, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HomeView } from "./components/home/HomeView";
import { RoomDetailView } from "./components/home/RoomDetailView";
import { AppShell } from "./components/shell/AppShell";
import { enUS, zhCN } from "./i18n";
import "./index.css";
import { InstancesPage } from "./pages/InstancesPage";
import { SetupPage } from "./pages/SetupPage";
import { setActiveInstance } from "./state/activeInstanceStore";
import { useCallService } from "./state/useCallService";
import { useEntities } from "./state/useEntities";
import { useInstances } from "./state/useInstances";
import { useRooms } from "./state/useRooms";
import type { ParsedRoute } from "./types";

function parseRoute(route: string): ParsedRoute {
  if (route === "/setup") return { page: "setup" };
  if (route === "/instances") return { page: "instances" };
  const home = route.match(/^\/instance\/([^/]+)\/home$/);
  if (home) return { page: "home", instanceId: home[1] };
  const room = route.match(/^\/instance\/([^/]+)\/room\/([^/]+)$/);
  if (room) return { page: "room", instanceId: room[1], roomId: room[2] };
  // Backward-compat: redirect old /rooms and /devices routes to /home.
  const legacy = route.match(/^\/instance\/([^/]+)\/(rooms|devices)$/);
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
  const { route } = nav;
  const parsed = useMemo(() => parseRoute(route), [route]);

  const instanceId =
    parsed.page === "home" || parsed.page === "room"
      ? (parsed.instanceId ?? null)
      : null;

  // ── Instances ────────────────────────────────────────────────────────────
  const {
    instances,
    loading: instancesLoading,
    reload: reloadInstances,
  } = useInstances();

  const effectiveInstanceId = instanceId ?? instances[0]?.id ?? null;

  // ── Live entity stream ───────────────────────────────────────────────────
  const { entities, connStatus } = useEntities(instanceId);

  // ── Service calls (optimistic-UI) ────────────────────────────────────────
  const { call: onCall, getPending } = useCallService(instanceId, ctx);

  // ── Rooms (for HomeView grouping + room detail navigation) ───────────────
  const { rooms } = useRooms(instanceId);

  // ── Sync activeInstanceStore ─────────────────────────────────────────────
  useEffect(() => {
    const inst = instances.find((i) => i.id === instanceId);
    setActiveInstance(instanceId, inst?.name ?? null);
  }, [instanceId, instances]);

  // ── MenuBar ──────────────────────────────────────────────────────────────
  const menuBarConfig = useMemo<MenuBarConfig>(
    () => ({
      menus: [
        {
          key: "home-assistant",
          label: "Home Assistant",
          items: [
            {
              key: "reload",
              label: t("menuReload"),
              onClick: () => void reloadInstances(),
            },
          ],
        },
      ],
      about: { description: "Home Assistant", version: "0.1.0" },
    }),
    [t, reloadInstances],
  );
  useShellMenuBar(ctx, menuBarConfig);

  // ── Redirect from "/" ────────────────────────────────────────────────────
  useEffect(() => {
    if (parsed.page !== "root") return;
    if (instancesLoading) return;
    if (instances.length === 0) {
      nav.replace("/setup", "Home Assistant");
    } else {
      const first = instances[0];
      nav.replace(
        `/instance/${first.id}/home`,
        `${first.name} · ${t("navHome")}`,
      );
    }
  }, [parsed.page, instances, instancesLoading, nav, t]);

  // ── Reconcile stale instanceId in URL ────────────────────────────────────
  useEffect(() => {
    if (parsed.page !== "home" && parsed.page !== "room") return;
    if (instancesLoading) return;
    if (!instanceId) return;
    if (instances.some((i) => i.id === instanceId)) return;
    if (instances.length === 0) {
      nav.replace("/setup", "Home Assistant");
    } else {
      const first = instances[0];
      nav.replace(
        `/instance/${first.id}/home`,
        `${first.name} · ${t("navHome")}`,
      );
    }
  }, [parsed.page, instanceId, instances, instancesLoading, nav, t]);

  // ── Reconcile stale roomId in URL (room no longer exists → /home) ────────
  useEffect(() => {
    if (parsed.page !== "room") return;
    if (!instanceId || !parsed.roomId) return;
    if (rooms.length === 0) return;
    if (rooms.some((r) => r.id === parsed.roomId)) return;
    const inst = instances.find((i) => i.id === instanceId);
    nav.replace(
      `/instance/${instanceId}/home`,
      inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant",
    );
  }, [parsed.page, parsed.roomId, instanceId, rooms, instances, nav, t]);

  // ── Navigate helpers ─────────────────────────────────────────────────────
  function navigateTo(path: string) {
    const r = parseRoute(path);
    let title = "Home Assistant";
    if (r.page === "instances") title = t("instancesTitle");
    else if (r.page === "setup") title = t("setupTitle");
    else if (r.page === "home" || r.page === "room") {
      const inst = instances.find((i) => i.id === r.instanceId);
      title = inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant";
    }
    nav.navigate(path, title);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (parsed.page === "root") {
    return <Spinner />;
  }

  if (parsed.page === "setup") {
    return (
      <SetupPage
        t={t}
        onAddInstance={() => nav.navigate("/instances", t("instancesTitle"))}
      />
    );
  }

  if (parsed.page === "instances") {
    return (
      <AppShell
        instances={instances}
        activeInstanceId={effectiveInstanceId}
        subPage="instances"
        connStatus={connStatus}
        t={t}
        onNavigate={navigateTo}
        onNavigateToInstances={() =>
          nav.navigate("/instances", t("instancesTitle"))
        }
      >
        <InstancesPage
          t={t}
          onSelectInstance={(id) => {
            const inst = instances.find((i) => i.id === id);
            nav.navigate(
              `/instance/${id}/home`,
              inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant",
            );
          }}
        />
      </AppShell>
    );
  }

  // Instance page (home | room)
  const activeInstance = instances.find((i) => i.id === instanceId) ?? null;

  return (
    <AppShell
      instances={instances}
      activeInstanceId={effectiveInstanceId}
      subPage="home"
      connStatus={connStatus}
      t={t}
      onNavigate={navigateTo}
      onNavigateToInstances={() =>
        nav.navigate("/instances", t("instancesTitle"))
      }
    >
      {parsed.page === "home" && activeInstance && (
        <HomeView
          instance={activeInstance}
          entities={entities}
          rooms={rooms}
          getPending={getPending}
          onCall={onCall}
          onOpenRoom={(rid) =>
            navigateTo(`/instance/${activeInstance.id}/room/${rid}`)
          }
          onOpenSettings={() => {
            // TODO R7p: open AnimatedSettingsPane for this instance.
          }}
          onToggleEdit={() => {
            // TODO R6p: enter Home edit mode.
          }}
          onReorderRooms={() => {
            // TODO R6p: enter Reorder Sections mode.
          }}
          t={t}
        />
      )}
      {parsed.page === "room" && activeInstance && parsed.roomId && (
        <RoomDetailViewWrapper
          instance={activeInstance}
          roomId={parsed.roomId}
          rooms={rooms}
          entities={entities}
          getPending={getPending}
          onCall={onCall}
          onBack={() => navigateTo(`/instance/${activeInstance.id}/home`)}
          t={t}
        />
      )}
    </AppShell>
  );
}

function RoomDetailViewWrapper({
  instance,
  roomId,
  rooms,
  entities,
  getPending,
  onCall,
  onBack,
  t,
}: {
  instance: import("./types").HaInstance;
  roomId: string;
  rooms: import("./types").HaRoom[];
  entities: ReadonlyMap<string, import("./types").EntityState>;
  getPending: (entityId: string) => import("./types").PendingOp | undefined;
  onCall: (params: import("./types").CallParams) => void;
  onBack: () => void;
  t: (k: string) => string;
}) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    // Rooms may still be loading — show spinner; the URL reconciler will redirect if it truly is gone.
    return <Spinner />;
  }
  return (
    <RoomDetailView
      instance={instance}
      room={room}
      entities={entities}
      getPending={getPending}
      onCall={onCall}
      onBack={onBack}
      t={t}
    />
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
