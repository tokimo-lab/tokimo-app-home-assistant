import { makeTranslator, type ShellWindowHandle } from "@tokimo/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateEntityDisplay } from "../../api/display";
import { listEntitiesByGroup } from "../../api/entities";
import { enUS, zhCN } from "../../i18n";
import { openDetailFromExternal } from "../../state/useDetailOverlay";
import type { EntityState } from "../../types";

interface ModalMetadata {
  instanceId?: string;
  groupId?: string;
  currentEntityId?: string;
  locale?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entities: EntityState[] };

/**
 * Modal listing every entity sharing the long-pressed tile's `group_id`.
 * Each row offers two actions:
 *
 *  - Click the row body → close the modal and open the inline detail
 *    overlay for that entity (cross-React-tree handoff via
 *    `openDetailFromExternal`, since modals run in a separate tree).
 *  - Click the trailing button → PATCH `group_primary: true` for that
 *    entity. The backend transactionally demotes the previous primary,
 *    so the home grid swaps tiles automatically via the WS stream.
 *    The currently primary entity instead shows a non-interactive
 *    `Currently Shown` badge.
 */
export default function SimilarEntitiesModal({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const meta = win.metadata as ModalMetadata;
  const locale = meta.locale ?? "en-US";
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, locale),
    [locale],
  );

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!meta.instanceId || !meta.groupId) {
      setLoadState({
        status: "error",
        message: "Missing instanceId or groupId in modal metadata.",
      });
      return;
    }
    try {
      const list = await listEntitiesByGroup(meta.instanceId, meta.groupId);
      setLoadState({ status: "ready", entities: list });
    } catch (e) {
      setLoadState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [meta.instanceId, meta.groupId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetPrimary = useCallback(
    async (entityId: string) => {
      if (!meta.instanceId) return;
      setBusyId(entityId);
      try {
        await updateEntityDisplay(meta.instanceId, entityId, {
          group_primary: true,
        });
        win.close();
      } catch (e) {
        setBusyId(null);
        setLoadState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [meta.instanceId, win],
  );

  const handleRowClick = useCallback(
    (entityId: string) => {
      if (!meta.instanceId) return;
      openDetailFromExternal(entityId, meta.instanceId);
      win.close();
    },
    [meta.instanceId, win],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-base,#0b0f17)] text-white">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadState.status === "loading" && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
          </div>
        )}
        {loadState.status === "error" && (
          <p className="text-sm text-red-400">{loadState.message}</p>
        )}
        {loadState.status === "ready" && loadState.entities.length === 0 && (
          <p className="text-sm text-white/50">{t("noSimilarAccessories")}</p>
        )}
        {loadState.status === "ready" && loadState.entities.length > 0 && (
          <ul className="flex flex-col gap-2">
            {loadState.entities.map((e) => (
              <Row
                key={e.entity_id}
                entity={e}
                isCurrent={e.entity_id === meta.currentEntityId}
                busy={busyId === e.entity_id}
                onRowClick={() => handleRowClick(e.entity_id)}
                onSetPrimary={() => void handleSetPrimary(e.entity_id)}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
  entity,
  isCurrent,
  busy,
  onRowClick,
  onSetPrimary,
  t,
}: {
  entity: EntityState;
  isCurrent: boolean;
  busy: boolean;
  onRowClick: () => void;
  onSetPrimary: () => void;
  t: (k: string) => string;
}) {
  const name =
    entity.display_name ?? entity.attributes.friendly_name ?? entity.entity_id;
  const icon = entity.custom_icon ?? entity.attributes.icon ?? "💡";
  const isPrimary = entity.group_primary === true;

  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 hover:bg-white/[0.06]">
      <button
        type="button"
        onClick={onRowClick}
        className="flex flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-base">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-white/40">
            {entity.entity_id}
          </span>
        </span>
      </button>
      <div className="ml-2 flex shrink-0 items-center">
        {isPrimary ? (
          <span className="rounded-full bg-[var(--accent,#6366f1)]/20 px-2.5 py-1 text-xs text-[var(--accent,#6366f1)]">
            {t("currentlyShown")}
          </span>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onSetPrimary();
            }}
            disabled={busy}
            className="cursor-pointer rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "…" : t("markAsPrimary")}
          </button>
        )}
        {isCurrent && !isPrimary && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-white/30">
            ●
          </span>
        )}
      </div>
    </li>
  );
}
