import { Button, Input } from "@tokimo/ui";
import { CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteInstance,
  testInstance,
  updateInstance,
} from "../../api/instances";
import type { HaInstance, UpdateInstanceDto } from "../../types";

interface FamilyTabProps {
  instance: HaInstance;
  onUpdated?: () => void;
  onDeleted: () => void;
  t: (k: string) => string;
}

type TestState = "idle" | "testing" | "ok" | "fail";

export function FamilyTab({
  instance,
  onUpdated,
  onDeleted,
  t,
}: FamilyTabProps) {
  const [name, setName] = useState(instance.name);
  const [url, setUrl] = useState(instance.base_url);
  const [token, setToken] = useState("");
  const [verifyTls, setVerifyTls] = useState(instance.verify_tls);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>("idle");

  useEffect(() => {
    setName(instance.name);
    setUrl(instance.base_url);
    setToken("");
    setVerifyTls(instance.verify_tls);
    setTestState("idle");
  }, [instance]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const dto: UpdateInstanceDto = {
        name: name.trim(),
        base_url: url.trim(),
        verify_tls: verifyTls,
      };
      const trimmed = token.trim();
      if (trimmed !== "") dto.access_token = trimmed;
      await updateInstance(instance.id, dto);
      setToken("");
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTestState("testing");
    try {
      const r = await testInstance(instance.id);
      setTestState(r.ok ? "ok" : "fail");
    } catch {
      setTestState("fail");
    }
  }

  async function remove() {
    if (!confirm(t("settingsDeleteConfirm"))) return;
    try {
      await deleteInstance(instance.id);
      onDeleted();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Field label={t("settingsFamilyName")} htmlFor="ha-fam-name">
        <Input
          id="ha-fam-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label={t("settingsFamilyUrl")} htmlFor="ha-fam-url">
        <Input
          id="ha-fam-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://homeassistant.local:8123"
        />
      </Field>

      <Field label={t("settingsFamilyToken")} htmlFor="ha-fam-token">
        <Input
          id="ha-fam-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={
            instance.access_token
              ? `${t("settingsFamilyTokenSet")} — ${t("settingsFamilyTokenPlaceholder")}`
              : t("settingsFamilyTokenPlaceholder")
          }
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={verifyTls}
          onChange={(e) => setVerifyTls(e.target.checked)}
          className="cursor-pointer"
        />
        {t("settingsFamilyVerifyTls")}
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? t("saving") : t("settingsSave")}
        </Button>
        <Button
          variant="default"
          disabled={testState === "testing"}
          onClick={test}
        >
          {testState === "testing" ? t("instancesTesting") : t("settingsTest")}
        </Button>
        {testState === "ok" && (
          <CheckCircle size={16} className="text-green-400" />
        )}
        {testState === "fail" && <XCircle size={16} className="text-red-400" />}
        <div className="flex-1" />
        <Button variant="default" onClick={remove}>
          <span className="text-red-400">{t("settingsDelete")}</span>
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs text-white/60">
        {label}
      </label>
      {children}
    </div>
  );
}
