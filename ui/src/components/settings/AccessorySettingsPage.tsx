import { makeTranslator, type ShellWindowHandle } from "@tokimo/sdk";
import { cn, Select, Switch } from "@tokimo/ui";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateEntityDisplay } from "../../api/display";
import { getEntity } from "../../api/entities";
import { listRooms } from "../../api/rooms";
import { enUS, zhCN } from "../../i18n";
import type {
  EntitySize,
  EntityState,
  HaRoom,
  UpdateEntityDisplayDto,
} from "../../types";
import { effectiveSizeForEntity } from "../home/_helpers";

/**
 * Dev-only flag to surface the "not certified" banner from AppleHome IMG_2664.
 * HA is not HomeKit-certified globally, so this is hidden by default; flip
 * by setting `localStorage.haShowNotCertified = "1"` for visual QA.
 */
function isCertWarningEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("haShowNotCertified") === "1";
  } catch {
    return false;
  }
}

/**
 * Modal-window entry: receives `ShellWindowHandle` from the host. Reads
 * `instanceId` / `entityId` / `locale` from `win.metadata`, builds its own
 * translator, and uses `win.close()` to dismiss the modal.
 *
 * This is the default export so the host can
 * `lazy(() => import("…/AccessorySettingsPage"))` it directly.
 */
export default function AccessorySettingsModal({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const meta = win.metadata as {
    instanceId?: string;
    entityId?: string;
    locale?: string;
  };
  const locale = meta.locale ?? "en-US";
  const t = useMemo(
    () => makeTranslator({ "zh-CN": zhCN, "en-US": enUS }, locale),
    [locale],
  );

  if (!meta.instanceId || !meta.entityId) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-base,#0b0f17)] px-4 text-sm text-red-300">
        Missing instanceId/entityId in modal metadata.
      </div>
    );
  }
  return (
    <AccessorySettingsPage
      instanceId={meta.instanceId}
      entityId={meta.entityId}
      onClose={() => win.close()}
      t={t}
    />
  );
}

interface AccessorySettingsPageProps {
  instanceId: string;
  entityId: string;
  onClose: () => void;
  t: (k: string) => string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entity: EntityState };

export function AccessorySettingsPage({
  instanceId,
  entityId,
  onClose,
  t,
}: AccessorySettingsPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [rooms, setRooms] = useState<HaRoom[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [entity, rs] = await Promise.all([
        getEntity(instanceId, entityId),
        listRooms(instanceId),
      ]);
      setLoadState({ status: "ready", entity });
      setRooms(rs);
    } catch (e) {
      setLoadState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [instanceId, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback(
    async (dto: UpdateEntityDisplayDto) => {
      const next = await updateEntityDisplay(instanceId, entityId, dto);
      setLoadState((prev) =>
        prev.status === "ready"
          ? { status: "ready", entity: { ...prev.entity, ...next } }
          : prev,
      );
    },
    [instanceId, entityId],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-base,#0b0f17)] text-white dark:bg-[var(--surface-base,#0b0f17)]">
      <Header
        entity={loadState.status === "ready" ? loadState.entity : null}
        onClose={onClose}
        t={t}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadState.status === "loading" && (
          <p className="text-sm text-white/60 dark:text-white/60">
            {t("accessoryLoading")}
          </p>
        )}
        {loadState.status === "error" && (
          <p className="text-sm text-red-400">{loadState.message}</p>
        )}
        {loadState.status === "ready" && (
          <Body entity={loadState.entity} rooms={rooms} onPatch={patch} t={t} />
        )}
      </div>
    </div>
  );
}

function Header({
  entity,
  onClose,
  t,
}: {
  entity: EntityState | null;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const name = entity
    ? (entity.display_name ??
      entity.attributes.friendly_name ??
      entity.entity_id)
    : "";
  const status = entity ? entity.state : "";
  return (
    <header className="flex h-14 items-center gap-3 border-b border-white/10 px-4 dark:border-white/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-lg dark:bg-white/[0.06]">
        {entity?.custom_icon ?? entity?.attributes.icon ?? "💡"}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className="truncate text-xs text-white/50 dark:text-white/50">
          {status}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("accessoryClose")}
        title={t("accessoryClose")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white"
      >
        <X size={16} />
      </button>
    </header>
  );
}

function Body({
  entity,
  rooms,
  onPatch,
  t,
}: {
  entity: EntityState;
  rooms: HaRoom[];
  onPatch: (dto: UpdateEntityDisplayDto) => Promise<void>;
  t: (k: string) => string;
}) {
  const showCertWarning = isCertWarningEnabled();
  return (
    <div className="flex flex-col gap-4 pb-8">
      {showCertWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t("accessoryNotCertified")}</span>
        </div>
      )}

      <NameEditor entity={entity} onPatch={onPatch} t={t} />

      <SettingRow label={t("accessoryRoom")}>
        <Select
          value={entity.area_id ?? ""}
          onChange={(v) => {
            const next = typeof v === "string" && v !== "" ? v : null;
            void onPatch({ area_id: next });
          }}
          options={[
            { value: "", label: t("accessoryRoomNone") },
            ...rooms.map((r) => ({ value: r.id, label: r.name })),
          ]}
          size="small"
          className="min-w-40"
        />
      </SettingRow>

      <SettingRow label={t("accessoryAddToHomeView")}>
        <Switch
          checked={!entity.hidden}
          onChange={(checked) => void onPatch({ hidden: !checked })}
        />
      </SettingRow>

      <SettingRow label={t("accessoryIncludeInFavorites")}>
        <Switch
          checked={Boolean(entity.is_favorite)}
          onChange={(checked) => void onPatch({ is_favorite: checked })}
        />
      </SettingRow>

      <p className="text-xs leading-relaxed text-white/40 dark:text-white/40">
        {t("accessoryHint")}
      </p>

      <Section label={t("accessorySectionGroup")}>
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-white/40"
        >
          {t("accessoryGroupComingSoon")}
        </button>
      </Section>

      <Section label={t("accessorySectionAutomations")}>
        <DisabledRow label={t("accessorySuggestedScenes")} />
        <DisabledRow label={t("accessoryAutomationStatus")} />
        <DisabledRow label={t("accessoryAutomationBridge")} />
      </Section>

      <Section label={t("accessorySectionAbout")}>
        <InfoRow
          label={t("accessoryManufacturer")}
          value={entity.device?.manufacturer ?? null}
        />
        <InfoRow
          label={t("accessoryModel")}
          value={entity.device?.model ?? null}
        />
        <InfoRow
          label={t("accessorySerialNumber")}
          value={entity.device?.serial_number ?? entity.entity_id}
        />
        <InfoRow
          label={t("accessoryFirmware")}
          value={entity.device?.sw_version ?? null}
        />
        <InfoRow label={t("accessoryHomekitCertified")} value={t("no")} />
      </Section>

      <Section label={t("accessorySectionAdvanced")}>
        <SettingRow label={t("accessoryTileSize")}>
          <Select
            value={effectiveSizeForEntity(entity)}
            onChange={(v) => {
              if (typeof v !== "string") return;
              void onPatch({ size: v as EntitySize });
            }}
            options={[
              { value: "small", label: t("accessoryTileSizeSmall") },
              { value: "medium", label: t("accessoryTileSizeMedium") },
              { value: "large", label: t("accessoryTileSizeLarge") },
            ]}
            size="small"
            className="min-w-36"
          />
        </SettingRow>
      </Section>
    </div>
  );
}

function NameEditor({
  entity,
  onPatch,
  t,
}: {
  entity: EntityState;
  onPatch: (dto: UpdateEntityDisplayDto) => Promise<void>;
  t: (k: string) => string;
}) {
  const currentName =
    entity.display_name ?? entity.attributes.friendly_name ?? entity.entity_id;
  const currentIcon = entity.custom_icon ?? entity.attributes.icon ?? "";

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [editingIcon, setEditingIcon] = useState(false);
  const [iconDraft, setIconDraft] = useState(currentIcon);

  useEffect(() => setNameDraft(currentName), [currentName]);
  useEffect(() => setIconDraft(currentIcon), [currentIcon]);

  async function commitName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (trimmed === currentName || trimmed === "") {
      setNameDraft(currentName);
      return;
    }
    try {
      await onPatch({ display_name: trimmed });
    } catch {
      setNameDraft(currentName);
    }
  }

  async function commitIcon() {
    const trimmed = iconDraft.trim();
    setEditingIcon(false);
    if (trimmed === currentIcon) {
      setIconDraft(currentIcon);
      return;
    }
    try {
      await onPatch({ custom_icon: trimmed === "" ? null : trimmed });
    } catch {
      setIconDraft(currentIcon);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
      {editingIcon ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: explicit edit affordance
          autoFocus
          value={iconDraft}
          onChange={(e) => setIconDraft(e.target.value)}
          onBlur={commitIcon}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitIcon();
            if (e.key === "Escape") {
              setIconDraft(currentIcon);
              setEditingIcon(false);
            }
          }}
          placeholder={t("accessoryIconPlaceholder")}
          className="h-10 w-12 shrink-0 rounded-full bg-white/[0.08] text-center text-base outline-none ring-1 ring-blue-400/60"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingIcon(true)}
          title={t("accessoryEditIcon")}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-lg transition hover:bg-white/[0.12]"
        >
          {currentIcon !== "" ? currentIcon : "💡"}
        </button>
      )}

      {editingName ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: explicit edit affordance
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitName();
            if (e.key === "Escape") {
              setNameDraft(currentName);
              setEditingName(false);
            }
          }}
          className="flex-1 rounded bg-white/[0.08] px-2 py-1 text-sm outline-none ring-1 ring-blue-400/60"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="group flex flex-1 cursor-pointer items-center gap-2 truncate rounded px-1 py-1 text-left text-sm hover:bg-white/[0.04]"
        >
          <span className="truncate">{currentName}</span>
          <Pencil
            size={12}
            className="text-white/30 opacity-0 transition group-hover:opacity-100"
          />
        </button>
      )}
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
      <span className="text-sm">{label}</span>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[11px] font-medium uppercase tracking-wider text-white/40 dark:text-white/40">
        {label}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function DisabledRow({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-sm text-white/40",
      )}
    >
      <span>{label}</span>
      <span className="text-xs">›</span>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-sm">
      <span className="text-white/60 dark:text-white/60">{label}</span>
      <span className="truncate text-right text-white/80 dark:text-white/80">
        {value !== null && value !== undefined && value !== "" ? value : "—"}
      </span>
    </div>
  );
}
