import { Button, Input } from "@tokimo/ui";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listInstances, updateInstance } from "../../api/instances";
import { listRooms } from "../../api/rooms";
import type { HaInstance, HaRoom } from "../../types";
import { RoomsCrud } from "./RoomsCrud";

interface HomeSettingsPageProps {
  instanceId: string;
  onClose: () => void;
  onBack?: () => void;
  /**
   * Optional rotate-token callback. If omitted, the row is hidden.
   * The caller (typically the desktop shell) wires this to a credential
   * dialog flow that re-issues a long-lived access token.
   */
  onRotateToken?: () => void;
  t: (k: string) => string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; instance: HaInstance; rooms: HaRoom[] };

/**
 * Home Settings page — landing target for the HomeMenu "Home Settings"
 * entry (plan §1.3). Manages family-level config: home name, rooms CRUD,
 * member placeholder, and HA instance metadata. Rendered inline (not as
 * modal) so it can stack on top of HomePage like AppleHome's nav push.
 */
export function HomeSettingsPage({
  instanceId,
  onClose,
  onBack,
  onRotateToken,
  t,
}: HomeSettingsPageProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const [instances, rooms] = await Promise.all([
        listInstances(),
        listRooms(instanceId),
      ]);
      const instance = instances.find((i) => i.id === instanceId);
      if (!instance) {
        setState({
          status: "error",
          message: t("homeSettingsInstanceMissing"),
        });
        return;
      }
      setState({ status: "ready", instance, rooms });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [instanceId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col bg-surface-base text-fg-primary">
      <header className="flex h-12 items-center gap-2 border-b border-white/10 px-3 dark:border-[var(--color-border-base)]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("homeSettingsBack")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <h2 className="flex-1 text-center text-sm font-semibold">
          {t("homeSettingsTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("accessoryClose")}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.status === "loading" && (
          <p className="text-sm text-white/60 dark:text-white/60">
            {t("homeSettingsLoading")}
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-red-400">{state.message}</p>
        )}
        {state.status === "ready" && (
          <div className="flex flex-col gap-5 pb-8">
            <Section label={t("homeSettingsSectionName")}>
              <HomeNameEditor
                instance={state.instance}
                onSaved={() => void refresh()}
                t={t}
              />
            </Section>

            <Section label={t("homeSettingsSectionRooms")}>
              <RoomsCrud
                instanceId={instanceId}
                rooms={state.rooms}
                onChanged={refresh}
                t={t}
              />
            </Section>

            <Section label={t("homeSettingsSectionMembers")}>
              <p className="rounded-lg bg-white/[0.02] px-3 py-2 text-xs text-fg-muted">
                {t("homeSettingsMembersComingSoon")}
              </p>
            </Section>

            <Section label={t("homeSettingsSectionAbout")}>
              <InfoRow
                label={t("homeSettingsAboutUrl")}
                value={state.instance.base_url}
              />
              <InfoRow
                label={t("homeSettingsAboutStatus")}
                value={statusToString(state.instance.status, t)}
              />
              {onRotateToken && (
                <button
                  type="button"
                  onClick={onRotateToken}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.05]"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw size={13} />
                    {t("homeSettingsRotateToken")}
                  </span>
                  <span className="text-xs text-fg-muted">›</span>
                </button>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeNameEditor({
  instance,
  onSaved,
  t,
}: {
  instance: HaInstance;
  onSaved: () => void;
  t: (k: string) => string;
}) {
  const [draft, setDraft] = useState(instance.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(instance.name), [instance.name]);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === instance.name) return;
    setSaving(true);
    setError(null);
    try {
      await updateInstance(instance.id, { name: trimmed });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = draft.trim() !== "" && draft.trim() !== instance.name;

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("homeSettingsNamePlaceholder")}
      />
      <Button
        variant="primary"
        disabled={!dirty || saving}
        onClick={() => void save()}
      >
        {saving ? t("saving") : t("settingsSave")}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
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
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-sm">
      <span className="text-white/60 dark:text-white/60">{label}</span>
      <span className="truncate text-right text-white/80 dark:text-white/80">
        {value}
      </span>
    </div>
  );
}

function statusToString(
  status: HaInstance["status"],
  t: (k: string) => string,
): string {
  if (typeof status === "string") {
    if (status === "connected") return t("homeSettingsStatusConnected");
    if (status === "connecting") return t("homeSettingsStatusConnecting");
    return t("homeSettingsStatusDisconnected");
  }
  return `${t("homeSettingsStatusError")}: ${status.error}`;
}
