import {
  type AppRuntimeCtx,
  type Dispose,
  defineApp,
  makeTranslator,
} from "@tokimo/sdk";
import { useShellWindowNav } from "@tokimo/sdk/react";
import {
  ConfigProvider,
  ToastProvider,
  enUS as uiEnUS,
  zhCN as uiZhCN,
} from "@tokimo/ui";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DetailOverlay } from "./components/detail/DetailOverlay";
import { HomePage } from "./components/home/HomePage";
import { RoomPageHost } from "./components/room/RoomPageHost";
import { AccessorySettingsPage } from "./components/settings/AccessorySettingsPage";
import {
  SettingsPane,
  type SettingsTab,
} from "./components/settings/SettingsPane";
import { AnimatedSettingsPane } from "./components/shell/AnimatedSettingsPane";
import { AppShell } from "./components/shell/AppShell";
import { HomeAssistantMenuBar } from "./components/shell/HomeAssistantMenuBar";
import { enUS, zhCN } from "./i18n";
// @ts-expect-error -- side-effect css import
import "./index.css";
import { SetupPage } from "./pages/SetupPage";
import { setActiveInstance } from "./state/activeInstanceStore";
import { useCallService } from "./state/useCallService";
import {
  registerOpenInNewWindow,
  useDetailOverlay,
} from "./state/useDetailOverlay";
import { useEntities } from "./state/useEntities";
import { useInstances } from "./state/useInstances";
import { clearRoomStack } from "./state/useRoomNav";
import { useRooms } from "./state/useRooms";
import type { ParsedRoute } from "./types";

function parseRoute(route: string): ParsedRoute {
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
  const { entities } = useEntities(instanceId);

  // ── Service calls (optimistic-UI) ────────────────────────────────────────
  const { call: onCall, getPending } = useCallService(instanceId, ctx);

  // ── Rooms (for HomePage grouping + room stack navigation) ────────────────
  const { rooms } = useRooms(instanceId);

  // ── Detail overlay state (for accessory-settings escape hatch) ───────────
  const { closeDetail } = useDetailOverlay();
  const [accessorySettingsEntityId, setAccessorySettingsEntityId] = useState<
    string | null
  >(null);

  // ── Settings pane (Family settings) ──────────────────────────────────────
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [settingsTargetId, setSettingsTargetId] = useState<string | null>(null);
  const [creatingFamily, setCreatingFamily] = useState(false);
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

  // ── Sync activeInstanceStore + reset transient stacks on instance change ─
  useEffect(() => {
    const inst = instances.find((i) => i.id === instanceId);
    setActiveInstance(instanceId, inst?.name ?? null);
    // Switching home/family invalidates any pushed rooms or open detail card.
    clearRoomStack();
    closeDetail();
    setAccessorySettingsEntityId(null);
  }, [instanceId, instances, closeDetail]);

  // ── Register `openInNewWindow` injection for DetailOverlay ───────────────
  // The desktop shell may eventually expose `openModalWindow` on AppRuntimeCtx;
  // until then we feature-detect and degrade gracefully.
  useEffect(() => {
    type MaybeOpenModalCtx = AppRuntimeCtx & {
      openModalWindow?: (opts: {
        component: () => Promise<unknown>;
        title?: string;
        metadata?: Record<string, unknown>;
      }) => void;
    };
    const maybe = ctx as MaybeOpenModalCtx;
    registerOpenInNewWindow(({ entityId, instanceId: iid }) => {
      if (typeof maybe.openModalWindow === "function") {
        maybe.openModalWindow({
          component: () =>
            import("./components/settings/AccessorySettingsPage"),
          title: t("accessoryClose"),
          metadata: { instanceId: iid, entityId },
        });
      } else {
        // TODO(H10/desktop): wire a real Tokimo modal once the SDK exposes
        // `openModalWindow`. For now we simply log so click-to-pop-out is a
        // no-op rather than a hard error.
        console.warn(
          "[home-assistant] openModalWindow not available in AppRuntimeCtx; " +
            "ignoring openInNewWindow for",
          iid,
          entityId,
        );
      }
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
    if (parsed.page !== "home") return;
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

  // ── Navigate helpers ─────────────────────────────────────────────────────
  function navigateTo(path: string) {
    const r = parseRoute(path);
    let title = "Home Assistant";
    if (r.page === "setup") title = t("setupTitle");
    else if (r.page === "home") {
      const inst = instances.find((i) => i.id === r.instanceId);
      title = inst ? `${inst.name} · ${t("navHome")}` : "Home Assistant";
    }
    nav.navigate(path, title);
  }

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

  const activeInstance = instances.find((i) => i.id === instanceId) ?? null;

  return (
    <HomeAssistantMenuBar
      ctx={ctx}
      instances={instances}
      t={t}
      reloadInstances={reloadInstances}
    >
      <AppShell
        instances={instances}
        activeInstanceId={effectiveInstanceId}
        settingsActive={
          settingsTab !== null ||
          creatingFamily ||
          accessorySettingsEntityId !== null
        }
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
          <>
            <HomePage
              instance={activeInstance}
              entities={entities}
              rooms={rooms}
              ctx={ctx}
              getPending={getPending}
              onCall={onCall}
              onOpenRoom={() => {
                /* HomePage uses pushRoom() internally via useRoomNav */
              }}
              onOpenSettings={() => openSettings({ tab: "family" })}
              t={t}
            />
            <RoomPageHost
              instance={activeInstance}
              entities={entities}
              rooms={rooms}
              ctx={ctx}
              getPending={getPending}
              onCall={onCall}
              t={t}
            />
            <DetailOverlay
              getEntity={(id) => entities.get(id)}
              onCall={onCall}
              getPending={getPending}
              onOpenSettings={(eid) => {
                setAccessorySettingsEntityId(eid);
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
                  nav.replace("/setup", "Home Assistant");
                }
              }}
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

        <AnimatedSettingsPane open={accessorySettingsEntityId !== null}>
          {accessorySettingsEntityId !== null && activeInstance && (
            <AccessorySettingsPage
              instanceId={activeInstance.id}
              entityId={accessorySettingsEntityId}
              onClose={() => setAccessorySettingsEntityId(null)}
              t={t}
            />
          )}
        </AnimatedSettingsPane>
      </AppShell>
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
