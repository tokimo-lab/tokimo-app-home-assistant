import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellToast } from "@tokimo/sdk/react";
import { Switch } from "@tokimo/ui";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateEntityDisplay } from "../api/display";
import { listEntities } from "../api/entities";
import { EntityIcon } from "../components/EntityIcon";
import { getDomain } from "../lib/domain";
import type { EntityState, HaInstance } from "../types";

interface EntityManagementPageProps {
  instance: HaInstance;
  ctx: AppRuntimeCtx;
  onBack: () => void;
  t: (k: string) => string;
}

/**
 * Domain rendering order for the management list (mirrors RoomPage). Anything
 * outside this list is bucketed into a trailing `other` group.
 */
const DOMAIN_ORDER: ReadonlyArray<string> = [
  "light",
  "switch",
  "climate",
  "fan",
  "cover",
  "media_player",
  "lock",
  "scene",
  "script",
  "input_boolean",
  "automation",
  "vacuum",
  "camera",
  "binary_sensor",
  "sensor",
];

const DOMAIN_TITLE_KEY: Record<string, string> = {
  light: "room.domain.light",
  switch: "room.domain.switch",
  climate: "room.domain.climate",
  fan: "room.domain.fan",
  cover: "room.domain.cover",
  media_player: "room.domain.media_player",
  lock: "room.domain.lock",
  scene: "room.domain.scene",
  script: "room.domain.script",
  input_boolean: "room.domain.input_boolean",
  automation: "room.domain.automation",
  vacuum: "room.domain.vacuum",
  camera: "room.domain.camera",
  binary_sensor: "room.domain.binary_sensor",
  sensor: "room.domain.sensor",
};

interface DomainGroup {
  domain: string;
  titleKey: string;
  entities: EntityState[];
}

function groupByDomain(list: EntityState[]): DomainGroup[] {
  const byDomain = new Map<string, EntityState[]>();
  for (const e of list) {
    const d = getDomain(e.entity_id);
    const arr = byDomain.get(d) ?? [];
    arr.push(e);
    byDomain.set(d, arr);
  }
  for (const arr of byDomain.values()) {
    arr.sort((a, b) => entityName(a).localeCompare(entityName(b)));
  }
  const groups: DomainGroup[] = [];
  const seen = new Set<string>();
  for (const domain of DOMAIN_ORDER) {
    const arr = byDomain.get(domain);
    if (!arr || arr.length === 0) continue;
    seen.add(domain);
    groups.push({
      domain,
      titleKey: DOMAIN_TITLE_KEY[domain] ?? "room.domain.other",
      entities: arr,
    });
  }
  const leftover: EntityState[] = [];
  for (const [d, arr] of byDomain) {
    if (!seen.has(d)) leftover.push(...arr);
  }
  if (leftover.length > 0) {
    leftover.sort((a, b) => entityName(a).localeCompare(entityName(b)));
    groups.push({
      domain: "other",
      titleKey: "room.domain.other",
      entities: leftover,
    });
  }
  return groups;
}

function entityName(e: EntityState): string {
  return (
    e.display_name ??
    e.attributes.friendly_name ??
    e.entity_id
  ).toString();
}

function matchesSearch(e: EntityState, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (e.entity_id.toLowerCase().includes(needle)) return true;
  if (entityName(e).toLowerCase().includes(needle)) return true;
  return false;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

export function EntityManagementPage({
  instance,
  ctx,
  onBack,
  t,
}: EntityManagementPageProps) {
  const toast = useShellToast(ctx);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  // Initial fetch — include hidden so the user can un-hide things from here.
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    listEntities(instance.id, { includeHidden: true })
      .then((list) => {
        if (cancelled) return;
        setEntities(list);
        setLoad({ status: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [instance.id]);

  // Group counts of group_id occurrences across the (entire) entity list.
  // Used to render "Group: N siblings" — counted on the unfiltered list so
  // the badge stays stable when the user types a search.
  const groupSiblingCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entities) {
      if (!e.group_id) continue;
      map.set(e.group_id, (map.get(e.group_id) ?? 0) + 1);
    }
    return map;
  }, [entities]);

  const filtered = useMemo(
    () => entities.filter((e) => matchesSearch(e, query)),
    [entities, query],
  );

  const groups = useMemo(() => groupByDomain(filtered), [filtered]);

  const totalCount = entities.length;
  const hiddenCount = entities.filter((e) => e.hidden === true).length;
  const shownCount = filtered.length;

  const setBusyFor = useCallback((entityId: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(entityId);
      else next.delete(entityId);
      return next;
    });
  }, []);

  // Optimistic patch: update local list, call API, revert + toast on failure.
  const patchField = useCallback(
    async (
      entityId: string,
      field: "hidden" | "collapsed",
      value: boolean,
    ): Promise<void> => {
      const original = entities.find((e) => e.entity_id === entityId);
      if (!original) return;
      setBusyFor(entityId, true);
      setEntities((prev) =>
        prev.map((e) =>
          e.entity_id === entityId ? { ...e, [field]: value } : e,
        ),
      );
      try {
        await updateEntityDisplay(instance.id, entityId, { [field]: value });
      } catch (err) {
        setEntities((prev) =>
          prev.map((e) => (e.entity_id === entityId ? original : e)),
        );
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${t("errorSave")}: ${msg}`);
      } finally {
        setBusyFor(entityId, false);
      }
    },
    [entities, instance.id, setBusyFor, toast, t],
  );

  const openSimilar = useCallback(
    (entity: EntityState) => {
      if (!entity.group_id) return;
      ctx.shell.openModalWindow({
        component: () => import("../components/home/SimilarEntitiesModal"),
        title: t("similarAccessories"),
        width: 480,
        height: 560,
        metadata: {
          instanceId: instance.id,
          groupId: entity.group_id,
          currentEntityId: entity.entity_id,
          locale: ctx.locale,
        },
      });
    },
    [ctx, instance.id, t],
  );

  const openEntitySettings = useCallback(
    (entity: EntityState) => {
      ctx.shell.openModalWindow({
        component: () => import("../components/settings/AccessorySettingsPage"),
        title: t("detailOpenSettings"),
        width: 500,
        height: 600,
        metadata: {
          instanceId: instance.id,
          entityId: entity.entity_id,
          locale: ctx.locale,
        },
      });
    },
    [ctx, instance.id, t],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/[0.05] bg-white/80 px-6 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80">
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-sm text-zinc-700 transition hover:bg-black/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
          aria-label={t("roomBack")}
        >
          <ChevronLeft size={20} />
          <span>{t("roomBack")}</span>
        </button>
        <h1 className="flex-1 truncate text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("entityManagement")}
        </h1>
        <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline dark:text-zinc-400">
          {t("entityMgmtShowing")
            .replace("{shown}", String(shownCount))
            .replace("{total}", String(totalCount))
            .replace("{hidden}", String(hiddenCount))}
        </span>
      </header>

      <div className="flex items-center gap-2 px-6 pt-4 pb-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-black/[0.06] bg-black/[0.03] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <Search
            size={16}
            className="shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <input
            type="text"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={t("entityMgmtSearchPlaceholder")}
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pt-2 pb-8">
        {load.status === "loading" && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
          </div>
        )}
        {load.status === "error" && (
          <p className="text-sm text-red-500">{load.message}</p>
        )}
        {load.status === "ready" && groups.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("homeEmpty")}
          </p>
        )}
        {load.status === "ready" &&
          groups.map((g) => (
            <section key={g.domain} className="mb-6">
              <h3 className="mt-2 mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {t(g.titleKey)}
              </h3>
              <ul className="flex flex-col gap-1">
                {g.entities.map((e) => (
                  <EntityRow
                    key={e.entity_id}
                    entity={e}
                    busy={busy.has(e.entity_id)}
                    siblingCount={
                      e.group_id ? (groupSiblingCount.get(e.group_id) ?? 1) : 0
                    }
                    onToggleHidden={(next) =>
                      void patchField(e.entity_id, "hidden", next)
                    }
                    onToggleCollapsed={(next) =>
                      void patchField(e.entity_id, "collapsed", next)
                    }
                    onOpenSimilar={() => openSimilar(e)}
                    onOpenSettings={() => openEntitySettings(e)}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}

interface EntityRowProps {
  entity: EntityState;
  busy: boolean;
  /** Total number of entities sharing `entity.group_id`. 0 = no group. */
  siblingCount: number;
  onToggleHidden: (next: boolean) => void;
  onToggleCollapsed: (next: boolean) => void;
  onOpenSimilar: () => void;
  onOpenSettings: () => void;
  t: (k: string) => string;
}

function EntityRow({
  entity,
  busy,
  siblingCount,
  onToggleHidden,
  onToggleCollapsed,
  onOpenSimilar,
  onOpenSettings,
  t,
}: EntityRowProps) {
  const name = entityName(entity);
  const domain = getDomain(entity.entity_id);
  const isHidden = entity.hidden === true;
  const isCollapsed = entity.collapsed === true;
  const inGroup = !!entity.group_id && siblingCount >= 2;
  const isNonPrimary = inGroup && entity.group_primary !== true;

  return (
    <li className="flex items-center gap-3 rounded-xl bg-black/[0.02] px-3 py-2.5 hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
      {/* Row body — clickable, opens AccessorySettingsPage */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200">
          <EntityIcon domain={domain} state={entity.state} size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {name}
            </span>
            {isNonPrimary && (
              <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                {t("entityMgmtNotPrimary")}
              </span>
            )}
          </span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {entity.entity_id}
          </span>
        </span>
      </button>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops bubbling; controls inside are real buttons */}
      <div
        className="flex shrink-0 items-center gap-4"
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => ev.stopPropagation()}
        role="presentation"
      >
        <ToggleCell label={t("entityMgmtHidden")}>
          <Switch
            checked={isHidden}
            disabled={busy}
            onChange={onToggleHidden}
          />
        </ToggleCell>
        <ToggleCell label={t("entityMgmtCollapsed")}>
          <Switch
            checked={isCollapsed}
            disabled={busy}
            onChange={onToggleCollapsed}
          />
        </ToggleCell>
        {inGroup && (
          <button
            type="button"
            onClick={onOpenSimilar}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-black/[0.06] bg-black/[0.03] px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-black/[0.06] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
          >
            <span>
              {t("entityMgmtGroupSiblings").replace(
                "{n}",
                String(siblingCount),
              )}
            </span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function ToggleCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
      <span>{label}</span>
      {children}
    </div>
  );
}
