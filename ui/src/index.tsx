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
import { AppShell } from "./components/shell/AppShell";
import { enUS, zhCN } from "./i18n";
import "./index.css";
import { DevicesPage } from "./pages/DevicesPage";
import { HomePage } from "./pages/HomePage";
import { InstancesPage } from "./pages/InstancesPage";
import { RoomsPage } from "./pages/RoomsPage";
import { SetupPage } from "./pages/SetupPage";
import { setActiveInstance } from "./state/activeInstanceStore";
import { useCallService } from "./state/useCallService";
import { useEntities } from "./state/useEntities";
import { useInstances } from "./state/useInstances";
import { useRooms } from "./state/useRooms";
import type { ParsedRoute, SubPage } from "./types";

function parseRoute(route: string): ParsedRoute {
  if (route === "/setup") return { page: "setup" };
  if (route === "/instances") return { page: "instances" };
  const m = route.match(/^\/instance\/([^/]+)\/(home|rooms|devices)$/);
  if (m) {
    return { page: m[2] as SubPage, instanceId: m[1] };
  }
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
    parsed.page === "home" ||
    parsed.page === "rooms" ||
    parsed.page === "devices"
      ? (parsed.instanceId ?? null)
      : null;

  const subPage: SubPage | null =
    parsed.page === "home" ||
    parsed.page === "rooms" ||
    parsed.page === "devices"
      ? (parsed.page as SubPage)
      : null;

  // ── Instances ────────────────────────────────────────────────────────────
  const {
    instances,
    loading: instancesLoading,
    reload: reloadInstances,
  } = useInstances();

  // ── Live entity stream ───────────────────────────────────────────────────
  const { entities, connStatus } = useEntities(instanceId);

  // ── Service calls (optimistic-UI) ────────────────────────────────────────
  const { call: onCall, getPending } = useCallService(instanceId, ctx);

  // ── Rooms (for HomePage grouping) ────────────────────────────────────────
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

  // ── Navigate helpers ─────────────────────────────────────────────────────
  function navigateTo(path: string) {
    const r = parseRoute(path);
    let title = "Home Assistant";
    if (r.page === "instances") title = t("instancesTitle");
    else if (r.page === "setup") title = t("setupTitle");
    else if (r.page !== "root") {
      const inst = instances.find((i) => i.id === r.instanceId);
      const pageName =
        r.page === "home"
          ? t("navHome")
          : r.page === "rooms"
            ? t("navRooms")
            : t("navDevices");
      title = inst ? `${inst.name} · ${pageName}` : "Home Assistant";
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
        activeInstanceId={instanceId}
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

  // Instance page (home | rooms | devices)
  return (
    <AppShell
      instances={instances}
      activeInstanceId={instanceId}
      subPage={subPage ?? "home"}
      connStatus={connStatus}
      t={t}
      onNavigate={navigateTo}
      onNavigateToInstances={() =>
        nav.navigate("/instances", t("instancesTitle"))
      }
    >
      {subPage === "home" && (
        <HomePage
          entities={entities}
          rooms={rooms}
          instanceId={instanceId ?? ""}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
      {subPage === "rooms" && (
        <RoomsPage
          entities={entities}
          instanceId={instanceId ?? ""}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
      {subPage === "devices" && (
        <DevicesPage
          entities={entities}
          instanceId={instanceId ?? ""}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
    </AppShell>
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
