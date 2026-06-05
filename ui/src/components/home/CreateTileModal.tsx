/**
 * Create-tile modal (P8.3.2). Opens via `ctx.shell.openModalWindow` from
 * the home page header's [+] menu. Builds a manual accessory group from a
 * user-picked set of entities + a chosen primary, optionally assigning the
 * primary entity to a room.
 */
import { makeTranslator, type ShellWindowHandle } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import { Search } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import * as accessoriesApi from "../../api/accessories";
import { updateEntityDisplay } from "../../api/display";
import { listRooms } from "../../api/rooms";
import { enUS, zhCN } from "../../i18n";
import { getEntitiesSnapshot, subscribeRender } from "../../state/entityStore";
import { refreshAccessoriesCache } from "../../state/useAccessories";
import type { EntityState, HaRoom } from "../../types";

interface CreateTileModalMeta {
  instanceId?: string;
  locale?: string;
  preselectedRoomId?: string | null;
}

export default function CreateTileModalWindow({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const meta = win.metadata as CreateTileModalMeta;
  const locale = meta.locale ?? "en-US";
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, locale),
    [locale],
  );

  if (!meta.instanceId) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base px-4 text-sm text-red-300">
        Missing instanceId in modal metadata.
      </div>
    );
  }
  return (
    <CreateTileModal
      instanceId={meta.instanceId}
      preselectedRoomId={meta.preselectedRoomId ?? null}
      onClose={() => win.close()}
      t={t}
    />
  );
}

interface CreateTileModalProps {
  instanceId: string;
  preselectedRoomId: string | null;
  onClose: () => void;
  t: (k: string) => string;
}

function CreateTileModal({
  instanceId,
  preselectedRoomId,
  onClose,
  t,
}: CreateTileModalProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(preselectedRoomId);
  const [rooms, setRooms] = useState<HaRoom[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );
  const allEntities = useMemo(() => Array.from(snapshot.values()), [snapshot]);

  useEffect(() => {
    let cancelled = false;
    listRooms(instanceId)
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch(() => {
        // Non-fatal; user can still create tile without picking a room.
      });
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allEntities
      .filter((e) => {
        if (!q) return true;
        const n = e.attributes.friendly_name ?? e.entity_id;
        return (
          n.toLowerCase().includes(q) || e.entity_id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aSel = selectedIds.has(a.entity_id);
        const bSel = selectedIds.has(b.entity_id);
        if (aSel !== bSel) return aSel ? -1 : 1;
        const an = a.attributes.friendly_name ?? a.entity_id;
        const bn = b.attributes.friendly_name ?? b.entity_id;
        return an.localeCompare(bn);
      });
  }, [allEntities, search, selectedIds]);

  function toggleEntity(entityId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
        if (primaryId === entityId) setPrimaryId(null);
      } else {
        next.add(entityId);
        if (primaryId === null) setPrimaryId(entityId);
      }
      return next;
    });
  }

  const canSubmit = selectedIds.size >= 1 && primaryId !== null && !submitting;

  async function submit() {
    if (!canSubmit || !primaryId) return;
    setSubmitting(true);
    setError(null);
    const memberIds = Array.from(selectedIds);
    const primaryEntity = snapshot.get(primaryId);
    const fallbackName =
      primaryEntity?.attributes.friendly_name ?? primaryId ?? "Tile";
    try {
      const naturalKey = `manual::${primaryId}::${Date.now()}`;
      await accessoriesApi.createManualGroup(instanceId, {
        natural_key: naturalKey,
        display_name: name.trim() ? name.trim() : fallbackName,
        member_entity_ids: memberIds,
        primary_entity_id: primaryId,
      });
      // Optionally place the new tile in a room by patching the primary
      // entity's area_id (accessory_groups themselves have no area_id).
      if (roomId) {
        try {
          await updateEntityDisplay(instanceId, primaryId, {
            area_id: roomId,
          });
        } catch (e) {
          console.warn("[CreateTileModal] failed to set area_id on primary", e);
        }
      }
      await refreshAccessoriesCache(instanceId);
      onClose();
    } catch (e) {
      console.error("[CreateTileModal] create failed", e);
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-base text-fg-primary">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <h2 className="text-base font-semibold">{t("createTileTitle")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full px-3 py-1 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          {t("cancel")}
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <Field label={t("createTileNameLabel")}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createTileNamePlaceholder")}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-fg-muted focus:border-blue-500/50 focus:outline-none"
          />
        </Field>

        <Field label={t("createTileRoomLabel")}>
          <select
            value={roomId ?? ""}
            onChange={(e) => setRoomId(e.target.value || null)}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
          >
            <option value="">{t("createTileRoomNone")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("createTileEntitiesLabel")}>
          <div className="relative mb-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("createTileSearchPlaceholder")}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 pl-9 text-sm text-white placeholder:text-fg-muted focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <EntityPicker
            entities={filtered}
            selectedIds={selectedIds}
            primaryId={primaryId}
            onToggle={toggleEntity}
            onSetPrimary={setPrimaryId}
            t={t}
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {t("createTileFailed")}: {error}
          </div>
        )}
      </div>

      <footer className="border-t border-white/[0.06] px-5 py-3">
        <div
          className="flex items-center justify-end gap-3"
          title={canSubmit ? undefined : t("createTilePrimaryHint")}
        >
          {primaryId === null && (
            <span className="mr-auto text-xs text-white/50">
              {selectedIds.size === 0
                ? t("createTileEmpty")
                : t("createTilePrimaryHint")}
            </span>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition",
              canSubmit
                ? "cursor-pointer bg-blue-500 text-white hover:bg-blue-400"
                : "cursor-not-allowed bg-white/[0.06] text-fg-muted",
            )}
          >
            {submitting ? "…" : t("createTileSubmit")}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children is always a form control rendered by callers
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function EntityPicker({
  entities,
  selectedIds,
  primaryId,
  onToggle,
  onSetPrimary,
  t,
}: {
  entities: EntityState[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggle: (id: string) => void;
  onSetPrimary: (id: string) => void;
  t: (k: string) => string;
}) {
  if (entities.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-6 text-center text-xs text-fg-muted">
        {t("createTileNoMatch")}
      </div>
    );
  }
  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
        <span />
        <span />
        <span>{t("createTilePrimaryColumn")}</span>
      </div>
      {entities.map((e) => {
        const checked = selectedIds.has(e.entity_id);
        const isPrimary = checked && primaryId === e.entity_id;
        return (
          <div
            key={e.entity_id}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2 text-sm transition",
              checked && "bg-blue-500/[0.08]",
              !checked && "hover:bg-white/[0.04]",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(e.entity_id)}
              className="h-4 w-4 cursor-pointer accent-blue-500"
            />
            <button
              type="button"
              onClick={() => onToggle(e.entity_id)}
              className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs">
                {e.custom_icon ?? e.attributes.icon ?? "·"}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-white">
                  {e.attributes.friendly_name ?? e.entity_id}
                </span>
                <span className="truncate text-xs text-fg-muted">
                  {e.entity_id}
                </span>
              </span>
            </button>
            <input
              type="radio"
              name="primaryEntity"
              checked={isPrimary}
              disabled={!checked}
              onChange={() => onSetPrimary(e.entity_id)}
              className={cn(
                "h-4 w-4 accent-blue-500",
                checked ? "cursor-pointer" : "cursor-not-allowed opacity-30",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
