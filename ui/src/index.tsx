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
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HomeView } from "./components/home/HomeView";
import { RoomDetailView } from "./components/home/RoomDetailView";
import {
  SettingsPane,
  type SettingsTab,
} from "./components/settings/SettingsPane";
import { AnimatedSettingsPane } from "./components/shell/AnimatedSettingsPane";
import { AppShell } from "./components/shell/AppShell";
import { enUS, zhCN } from "./i18n";
// @ts-expect-error -- side-effect css import
import "./index.css";
import { SetupPage } from "./pages/SetupPage";
import { setActiveInstance } from "./state/activeInstanceStore";
import { useCallService } from "./state/useCallService";
import { useEntities } from "./state/useEntities";
import { useInstances } from "./state/useInstances";
import { useRooms } from "./state/useRooms";
import type { ParsedRoute } from "./types";

function parseRoute(route: string): ParsedRoute {
  if (route === "/setup") return { page: "setup" };
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
  const { entities } = useEntities(instanceId);

  // ── Service calls (optimistic-UI) ────────────────────────────────────────
  const { call: onCall, getPending } = useCallService(instanceId, ctx);

  // ── Display mutations are consumed inside HomeView/RoomDetailView,
  //    which call useDisplayPatch(instance.id, ctx, t) themselves.

  // ── Rooms (for HomeView grouping + room detail navigation) ───────────────
  const {
    rooms,
    editRoom,
    reload: reloadRooms,
    syncAreas,
  } = useRooms(instanceId);

  // ── Settings pane ────────────────────────────────────────────────────────
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [settingsTargetId, setSettingsTargetId] = useState<string | null>(null);
  // ── New-family editor ────────────────────────────────────────────────────
  const [creatingFamily, setCreatingFamily] = useState(false);
  // Close the pane whenever the active instance changes (URL or list reconcile),
  // unless we're explicitly reopening it (e.g. avatar right-click which sets
  // both in the same React event).
  useEffect(() => {
    setSettingsTab(null);
    setSettingsTargetId(null);
  }, []);
  const openSettings = (opts: { tab: SettingsTab; instanceId?: string }) => {
    const targetId = opts.instanceId ?? effectiveInstanceId;
    setCreatingFamily(false);
    setSettingsTargetId(targetId);
    setSettingsTab(opts.tab);
  };
  const closeSettings = () => {
    setSettingsTab(null);
    setSettingsTargetId(null);
  };
  const openCreateFamily = () => {
    setSettingsTab(null);
    setSettingsTargetId(null);
    setCreatingFamily(true);
  };
  const closeCreateFamily = () => setCreatingFamily(false);

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
    if (r.page === "setup") title = t("setupTitle");
    else if (r.page === "home" || r.page === "room") {
      const inst = instances.find((i) => i.id === r.instanceId);
      title = inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant";
    }
    nav.navigate(path, title);
  }

  // ── Handle a successful family creation ─────────────────────────────────
  function handleFamilyCreated(created: import("./types").HaInstance) {
    setCreatingFamily(false);
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

  if (parsed.page === "setup") {
    return <SetupPage t={t} onCreated={handleFamilyCreated} />;
  }

  // Instance page (home | room)
  const activeInstance = instances.find((i) => i.id === instanceId) ?? null;

  return (
    <AppShell
      instances={instances}
      activeInstanceId={effectiveInstanceId}
      settingsActive={settingsTab !== null || creatingFamily}
      onNavigate={navigateTo}
      onCreateInstance={openCreateFamily}
      onOpenSettings={() => openSettings({ tab: "family" })}
      onContextMenuInstance={(id, e) => {
        e.preventDefault();
        if (id !== instanceId) {
          navigateTo(`/instance/${id}/home`);
        }
        openSettings({ tab: "family", instanceId: id });
      }}
      t={t}
    >
      {parsed.page === "home" && activeInstance && (
        <HomeView
          instance={activeInstance}
          entities={entities}
          rooms={rooms}
          ctx={ctx}
          getPending={getPending}
          onCall={onCall}
          onOpenRoom={(rid) =>
            navigateTo(`/instance/${activeInstance.id}/room/${rid}`)
          }
          onOpenSettings={() => openSettings({ tab: "family" })}
          t={t}
        />
      )}
      {parsed.page === "room" && activeInstance && parsed.roomId && (
        <RoomDetailViewWrapper
          instance={activeInstance}
          roomId={parsed.roomId}
          rooms={rooms}
          entities={entities}
          ctx={ctx}
          getPending={getPending}
          onCall={onCall}
          onBack={() => navigateTo(`/instance/${activeInstance.id}/home`)}
          t={t}
        />
      )}

      <AnimatedSettingsPane open={settingsTab !== null}>
        {settingsTab !== null && (
          <SettingsPane
            instance={
              settingsTargetId
                ? (instances.find((i) => i.id === settingsTargetId) ?? null)
                : null
            }
            tab={settingsTab}
            onTabChange={(tab) => setSettingsTab(tab)}
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
                nav.replace("/setup", "Home Assistant");
              }
            }}
            rooms={rooms}
            ctx={ctx}
            onEditRoom={editRoom}
            onReloadRooms={reloadRooms}
            onSyncAreas={syncAreas}
            t={t}
          />
        )}
      </AnimatedSettingsPane>

      <AnimatedSettingsPane open={creatingFamily}>
        {creatingFamily && (
          <SetupPage
            t={t}
            onCreated={handleFamilyCreated}
            onCancel={closeCreateFamily}
          />
        )}
      </AnimatedSettingsPane>
    </AppShell>
  );
}

function RoomDetailViewWrapper({
  instance,
  roomId,
  rooms,
  entities,
  ctx,
  getPending,
  onCall,
  onBack,
  t,
}: {
  instance: import("./types").HaInstance;
  roomId: string;
  rooms: import("./types").HaRoom[];
  entities: ReadonlyMap<string, import("./types").EntityState>;
  ctx: AppRuntimeCtx;
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
      ctx={ctx}
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
