/**
 * Merge-tiles modal (P8.3.4). Combines all members of N source tiles into
 * a single new manual accessory group and tears down the originals.
 *
 * Atomicity: the new group is created first, then each source group is
 * deleted. If any DELETE fails, the freshly-created group is rolled back
 * with another DELETE so the user can retry without ending up with an
 * orphaned half-merged tile.
 */
import { makeTranslator, type ShellWindowHandle } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import { useMemo, useState, useSyncExternalStore } from "react";
import * as accessoriesApi from "../../api/accessories";
import { enUS, zhCN } from "../../i18n";
import { getEntitiesSnapshot, subscribeRender } from "../../state/entityStore";
import { refreshAccessoriesCache } from "../../state/useAccessories";

interface MergeTilesMeta {
  instanceId?: string;
  locale?: string;
  /** Source tile group_ids to be merged then deleted. */
  groupIds?: string[];
  /** Pre-resolved list of all unique member entity_ids across the sources. */
  memberEntityIds?: string[];
  /** Suggested initial primary (the first source tile's primary). */
  suggestedPrimaryId?: string;
}

export default function MergeTilesModalWindow({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const meta = win.metadata as MergeTilesMeta;
  const locale = meta.locale ?? "en-US";
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, locale),
    [locale],
  );

  if (
    !meta.instanceId ||
    !meta.groupIds ||
    meta.groupIds.length < 2 ||
    !meta.memberEntityIds ||
    meta.memberEntityIds.length === 0
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-base,#0b0f17)] px-4 text-sm text-red-300">
        Missing merge metadata.
      </div>
    );
  }
  return (
    <MergeTilesModal
      instanceId={meta.instanceId}
      groupIds={meta.groupIds}
      memberEntityIds={meta.memberEntityIds}
      suggestedPrimaryId={meta.suggestedPrimaryId ?? meta.memberEntityIds[0]!}
      onClose={() => win.close()}
      t={t}
    />
  );
}

interface Props {
  instanceId: string;
  groupIds: string[];
  memberEntityIds: string[];
  suggestedPrimaryId: string;
  onClose: () => void;
  t: (k: string) => string;
}

function MergeTilesModal({
  instanceId,
  groupIds,
  memberEntityIds,
  suggestedPrimaryId,
  onClose,
  t,
}: Props) {
  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  const [primaryId, setPrimaryId] = useState<string>(suggestedPrimaryId);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberRows = useMemo(
    () =>
      memberEntityIds
        .map((id) => snapshot.get(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    [memberEntityIds, snapshot],
  );

  const primaryEntity = snapshot.get(primaryId);
  const fallbackName = primaryEntity?.attributes.friendly_name ?? primaryId;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    let createdGroupId: string | null = null;
    try {
      const naturalKey = `manual::merged::${Date.now()}`;
      const created = await accessoriesApi.createManualGroup(instanceId, {
        natural_key: naturalKey,
        display_name: name.trim() ? name.trim() : fallbackName,
        member_entity_ids: memberEntityIds,
        primary_entity_id: primaryId,
      });
      createdGroupId = created.group.id;

      // Tear down originals; if any fails, roll back the merge target.
      for (const gid of groupIds) {
        await accessoriesApi.deleteAccessoryGroup(gid);
      }

      await refreshAccessoriesCache(instanceId);
      onClose();
    } catch (e) {
      console.error("[MergeTilesModal] failed", e);
      if (createdGroupId) {
        try {
          await accessoriesApi.deleteAccessoryGroup(createdGroupId);
        } catch (rollbackErr) {
          console.error("[MergeTilesModal] rollback also failed", rollbackErr);
        }
      }
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--surface-base,#0b0f17)] text-[var(--text-primary,#fff)]">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <h2 className="text-base font-semibold">{t("mergeTilesTitle")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full px-3 py-1 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          {t("cancel")}
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <p className="text-sm text-white/60">
          {t("mergeTilesIntro").replace("{n}", String(groupIds.length))}
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            {t("mergeTilesNameLabel")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={fallbackName}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-blue-500/50 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            {t("mergeTilesPickPrimary")}
          </span>
          <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
            {memberRows.map((e) => {
              const isPrimary = primaryId === e.entity_id;
              return (
                <label
                  key={e.entity_id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 transition",
                    isPrimary ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <input
                    type="radio"
                    name="mergePrimary"
                    checked={isPrimary}
                    onChange={() => setPrimaryId(e.entity_id)}
                    className="h-4 w-4 cursor-pointer accent-blue-500"
                  />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs">
                    {e.custom_icon ?? e.attributes.icon ?? "·"}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-white">
                      {e.attributes.friendly_name ?? e.entity_id}
                    </span>
                    <span className="truncate text-xs text-white/40">
                      {e.entity_id}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {t("mergeTilesFailed")}: {error}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end border-t border-white/[0.06] px-5 py-3">
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className={cn(
            "rounded-full px-5 py-2 text-sm font-semibold transition",
            submitting
              ? "cursor-wait bg-white/[0.06] text-white/40"
              : "cursor-pointer bg-blue-500 text-white hover:bg-blue-400",
          )}
        >
          {submitting ? "…" : t("mergeTilesSubmit")}
        </button>
      </footer>
    </div>
  );
}
