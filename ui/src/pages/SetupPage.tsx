import { Button, Input } from "@tokimo/ui";
import { Home } from "lucide-react";
import { useState } from "react";
import { createInstance } from "../api/instances";
import type { CreateInstanceDto, HaInstance } from "../types";

interface SetupPageProps {
  t: (k: string) => string;
  onCreated: (instance: HaInstance) => void;
  /** When provided, an extra Cancel button is rendered (editor mode). */
  onCancel?: () => void;
}

export function SetupPage({ t, onCreated, onCancel }: SetupPageProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim() !== "" && url.trim() !== "" && token.trim() !== "" && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const dto: CreateInstanceDto = {
        name: name.trim(),
        base_url: url.trim(),
        access_token: token.trim(),
        verify_tls: verifyTls,
      };
      const created = await createInstance(dto);
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-subtle,rgba(99,102,241,0.15))]">
            <Home size={32} className="text-[var(--accent,#6366f1)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {t("setupTitle")}
          </h1>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            {t("setupSubtitle")}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="ha-setup-name"
              className="mb-1 block text-xs text-[var(--text-secondary)]"
            >
              {t("instancesName")}
            </label>
            <Input
              id="ha-setup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("instancesNamePlaceholder")}
            />
          </div>
          <div>
            <label
              htmlFor="ha-setup-url"
              className="mb-1 block text-xs text-[var(--text-secondary)]"
            >
              {t("instancesUrl")}
            </label>
            <Input
              id="ha-setup-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("instancesUrlPlaceholder")}
            />
          </div>
          <div>
            <label
              htmlFor="ha-setup-token"
              className="mb-1 block text-xs text-[var(--text-secondary)]"
            >
              {t("instancesToken")}
            </label>
            <Input
              id="ha-setup-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("instancesTokenPlaceholder")}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={verifyTls}
              onChange={(e) => setVerifyTls(e.target.checked)}
              className="cursor-pointer"
            />
            {t("instancesVerifyTls")}
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            {onCancel && (
              <Button variant="default" onClick={onCancel} disabled={saving}>
                {t("cancel")}
              </Button>
            )}
            <Button variant="primary" onClick={submit} disabled={!canSubmit}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
