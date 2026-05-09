/**
 * Split-tile modal (P8.3.5). Two-step wizard:
 *
 * Step 1 — pick which members to split out (≥1) and pick the new primaries
 *          for both the surviving old tile (only if the existing primary is
 *          being split out) and the new tile (only if ≥2 members are being
 *          split out; otherwise the single split-out entity is forced).
 *
 * Step 2 — name the new tile and assign a room (defaults to the old tile
 *          primary's current `area_id`).
 *
 * Submit sequence:
 *   1. If the old primary is moving out: PATCH a kept member to be primary
 *      first so the old group never has zero primaries.
 *   2. DELETE each split-out member from the old group.
 *   3. POST a new manual group containing the split-out members with the
 *      chosen primary (`natural_key = manual::split::<ts>`).
 *   4. Optionally PATCH the new primary's `area_id` to the picked room.
 *   5. Refresh accessories cache and close.
 */
import { makeTranslator, type ShellWindowHandle } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as accessoriesApi from "../../api/accessories";
import { updateEntityDisplay } from "../../api/display";
import { listRooms } from "../../api/rooms";
import { enUS, zhCN } from "../../i18n";
import { getEntitiesSnapshot, subscribeRender } from "../../state/entityStore";
import { refreshAccessoriesCache } from "../../state/useAccessories";
import type { HaRoom } from "../../types";

interface SplitTileMeta {
  instanceId?: string;
  locale?: string;
  /** The single source group_id being split. */
  groupId?: string;
  /** All current member entity_ids (in display order). */
  memberEntityIds?: string[];
}

export default function SplitTileModalWindow({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const meta = win.metadata as SplitTileMeta;
  const locale = meta.locale ?? "en-US";
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, locale),
    [locale],
  );

  if (
    !meta.instanceId ||
    !meta.groupId ||
    !meta.memberEntityIds ||
    meta.memberEntityIds.length < 2
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-base,#0b0f17)] px-4 text-sm text-red-300">
        Missing split metadata.
      </div>
    );
  }
  return (
    <SplitTileModal
      instanceId={meta.instanceId}
      groupId={meta.groupId}
      memberEntityIds={meta.memberEntityIds}
      onClose={() => win.close()}
      t={t}
    />
  );
}

interface Props {
  instanceId: string;
  groupId: string;
  memberEntityIds: string[];
  onClose: () => void;
  t: (k: string) => string;
}

function SplitTileModal({
  instanceId,
  groupId,
  memberEntityIds,
  onClose,
  t,
}: Props) {
  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  // Resolve current primary + default area from server-side membership.
  const [currentPrimaryId, setCurrentPrimaryId] = useState<string | null>(null);
  const [defaultAreaId, setDefaultAreaId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const members = await accessoriesApi.getAccessoryMembers(groupId);
        if (cancelled) return;
        const primary = members.find((m) => m.is_primary);
        const primaryId = primary?.entity_id ?? memberEntityIds[0]!;
        setCurrentPrimaryId(primaryId);
        const e = getEntitiesSnapshot().get(primaryId);
        setDefaultAreaId(e?.area_id ?? null);
      } catch {
        if (!cancelled) setCurrentPrimaryId(memberEntityIds[0]!);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, memberEntityIds]);

  const [step, setStep] = useState<1 | 2>(1);
  const [splitOut, setSplitOut] = useState<Set<string>>(new Set());
  const [newOldPrimaryId, setNewOldPrimaryId] = useState<string | null>(null);
  const [newPrimaryId, setNewPrimaryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<HaRoom[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await listRooms(instanceId);
        if (!cancelled) setRooms(r);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  // When defaultAreaId loads, pre-fill the room picker (only once).
  useEffect(() => {
    if (defaultAreaId && roomId === null) setRoomId(defaultAreaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAreaId, roomId]);

  const splitOutList = useMemo(
    () => memberEntityIds.filter((id) => splitOut.has(id)),
    [memberEntityIds, splitOut],
  );
  const keepList = useMemo(
    () => memberEntityIds.filter((id) => !splitOut.has(id)),
    [memberEntityIds, splitOut],
  );

  const oldPrimaryMovingOut =
    currentPrimaryId !== null && splitOut.has(currentPrimaryId);

  // When splitting just one entity out, it is forced as new tile primary.
  const effectiveNewPrimary =
    splitOutList.length === 1 ? splitOutList[0]! : newPrimaryId;

  // When old primary is moving out we need someone else to take over.
  const effectiveNewOldPrimary = oldPrimaryMovingOut
    ? (newOldPrimaryId ?? null)
    : currentPrimaryId;

  const step1Valid =
    splitOutList.length >= 1 &&
    keepList.length >= 1 &&
    (oldPrimaryMovingOut ? newOldPrimaryId !== null : true) &&
    (splitOutList.length >= 2 ? newPrimaryId !== null : true);

  function toggleSplit(id: string) {
    setSplitOut((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Reset radios when membership changes.
    setNewOldPrimaryId(null);
    setNewPrimaryId(null);
  }

  async function submit() {
    if (submitting) return;
    if (!effectiveNewPrimary) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1. Re-primary the old group if needed.
      if (oldPrimaryMovingOut && effectiveNewOldPrimary) {
        await accessoriesApi.updateMember(groupId, effectiveNewOldPrimary, {
          is_primary: true,
        });
      }

      // 2. Remove split-out members from the old group.
      for (const eid of splitOutList) {
        await accessoriesApi.removeMember(groupId, eid);
      }

      // 3. Create the new manual group from split-out members.
      const naturalKey = `manual::split::${Date.now()}`;
      const fallback =
        snapshot.get(effectiveNewPrimary)?.attributes.friendly_name ??
        effectiveNewPrimary;
      const created = await accessoriesApi.createManualGroup(instanceId, {
        natural_key: naturalKey,
        display_name: name.trim() ? name.trim() : fallback,
        member_entity_ids: splitOutList,
        primary_entity_id: effectiveNewPrimary,
      });

      // 4. Optional: assign the new tile to a room via the new primary's display.
      if (roomId) {
        try {
          await updateEntityDisplay(instanceId, effectiveNewPrimary, {
            area_id: roomId,
          });
        } catch (e) {
          console.warn("[SplitTileModal] area_id patch failed", e);
        }
      }

      void created;
      await refreshAccessoriesCache(instanceId);
      onClose();
    } catch (e) {
      console.error("[SplitTileModal] failed", e);
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--surface-base,#0b0f17)] text-[var(--text-primary,#fff)]">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <h2 className="text-base font-semibold">
          {step === 1 ? t("splitTileStep1Title") : t("splitTileStep2Title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full px-3 py-1 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          {t("cancel")}
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {step === 1 ? (
          <>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
              {memberEntityIds.map((id) => {
                const e = snapshot.get(id);
                const checked = splitOut.has(id);
                const isCurrentPrimary = currentPrimaryId === id;
                return (
                  <label
                    key={id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 transition",
                      checked ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSplit(id)}
                      className="h-4 w-4 cursor-pointer accent-blue-500"
                    />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs">
                      {e?.custom_icon ?? e?.attributes.icon ?? "·"}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-white">
                        {e?.attributes.friendly_name ?? id}
                      </span>
                      <span className="truncate text-xs text-white/40">
                        {id}
                      </span>
                    </span>
                    {isCurrentPrimary && (
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium uppercase text-blue-300">
                        primary
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {oldPrimaryMovingOut && (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                  {t("splitTilePickOldPrimary")}
                </span>
                <RadioRows
                  ids={keepList}
                  value={newOldPrimaryId}
                  onChange={setNewOldPrimaryId}
                  snapshot={snapshot}
                  name="splitOldPrimary"
                />
              </div>
            )}

            {splitOutList.length >= 2 && (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                  {t("splitTilePickNewPrimary")}
                </span>
                <RadioRows
                  ids={splitOutList}
                  value={newPrimaryId}
                  onChange={setNewPrimaryId}
                  snapshot={snapshot}
                  name="splitNewPrimary"
                />
              </div>
            )}

            {splitOutList.length === 0 && (
              <p className="text-xs text-white/50">
                {t("splitTileMustSplitOne")}
              </p>
            )}
            {splitOutList.length > 0 && keepList.length === 0 && (
              <p className="text-xs text-amber-300">
                {t("splitTileMustKeepOne")}
              </p>
            )}
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                {t("splitTileNewNameLabel")}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  effectiveNewPrimary
                    ? (snapshot.get(effectiveNewPrimary)?.attributes
                        .friendly_name ?? effectiveNewPrimary)
                    : ""
                }
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-blue-500/50 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                {t("splitTileNewRoomLabel")}
              </span>
              <select
                value={roomId ?? ""}
                onChange={(e) => setRoomId(e.target.value || null)}
                className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
              >
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {t("splitTileFailed")}: {error}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
        <div>
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="cursor-pointer rounded-full px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              {t("splitTilePrev")}
            </button>
          )}
        </div>
        {step === 1 ? (
          <button
            type="button"
            disabled={!step1Valid}
            onClick={() => setStep(2)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition",
              step1Valid
                ? "cursor-pointer bg-blue-500 text-white hover:bg-blue-400"
                : "cursor-not-allowed bg-white/[0.06] text-white/40",
            )}
          >
            {t("splitTileNext")}
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !effectiveNewPrimary}
            onClick={submit}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition",
              submitting
                ? "cursor-wait bg-white/[0.06] text-white/40"
                : "cursor-pointer bg-blue-500 text-white hover:bg-blue-400",
            )}
          >
            {submitting ? "…" : t("splitTileSubmit")}
          </button>
        )}
      </footer>
    </div>
  );
}

function RadioRows({
  ids,
  value,
  onChange,
  snapshot,
  name,
}: {
  ids: string[];
  value: string | null;
  onChange: (id: string) => void;
  snapshot: ReturnType<typeof getEntitiesSnapshot>;
  name: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      {ids.map((id) => {
        const e = snapshot.get(id);
        const checked = value === id;
        return (
          <label
            key={id}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-2 transition",
              checked ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.04]",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange(id)}
              className="h-4 w-4 cursor-pointer accent-blue-500"
            />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs">
              {e?.custom_icon ?? e?.attributes.icon ?? "·"}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-white">
                {e?.attributes.friendly_name ?? id}
              </span>
              <span className="truncate text-xs text-white/40">{id}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

// (helper removed: we use useEffect for one-shot async loads.)
