import { ChevronLeft, Home } from "lucide-react";
import { useState } from "react";
import { createInstance } from "../api/instances";
import type { CreateInstanceDto, HaInstance } from "../types";

interface SetupPageProps {
  t: (k: string) => string;
  onCreated: (instance: HaInstance) => void;
  /** When provided, renders a back arrow that calls this. */
  onBack?: () => void;
}

export function SetupPage({ t, onCreated, onBack }: SetupPageProps) {
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
    <div className="relative flex h-full w-full flex-col overflow-auto bg-surface-base">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="absolute left-20 top-10 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <div className="flex min-h-full w-full items-center justify-center px-8 py-16">
        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 shadow-[0_20px_60px_-15px_rgba(120,80,255,0.6)]">
              <Home size={36} className="text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {t("setupTitle")}
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-white/60">
              {t("setupSubtitle")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Field
              id="ha-setup-name"
              label={t("instancesName")}
              value={name}
              onChange={setName}
              placeholder={t("instancesNamePlaceholder")}
            />
            <Field
              id="ha-setup-url"
              label={t("instancesUrl")}
              value={url}
              onChange={setUrl}
              placeholder={t("instancesUrlPlaceholder")}
            />
            <Field
              id="ha-setup-token"
              label={t("instancesToken")}
              type="password"
              value={token}
              onChange={setToken}
              placeholder={t("instancesTokenPlaceholder")}
            />

            <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-white/60">
              <input
                type="checkbox"
                checked={verifyTls}
                onChange={(e) => setVerifyTls(e.target.checked)}
                className="cursor-pointer accent-white"
              />
              {t("instancesVerifyTls")}
            </label>

            {error && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-4 w-full cursor-pointer rounded-2xl bg-white py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-xs text-white/50">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/30 focus:bg-white/[0.09]"
      />
    </div>
  );
}
