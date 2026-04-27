import { Button, Card, Input } from "@tokimo/ui";
import { CheckCircle, Edit2, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import {
  createInstance,
  deleteInstance,
  testInstance,
  updateInstance,
} from "../api/instances";
import { useInstances } from "../state/useInstances";
import type { CreateInstanceDto, HaInstance, UpdateInstanceDto } from "../types";

interface InstancesPageProps {
  t: (k: string) => string;
  onSelectInstance: (id: string) => void;
}

type TestState = "idle" | "testing" | "ok" | "fail";

export function InstancesPage({ t, onSelectInstance }: InstancesPageProps) {
  const { instances, loading, error, reload } = useInstances();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HaInstance | null>(null);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);

  function openAdd() {
    setEditing(null);
    setName("");
    setUrl("");
    setToken("");
    setVerifyTls(true);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(inst: HaInstance) {
    setEditing(inst);
    setName(inst.name);
    setUrl(inst.base_url);
    setToken("");
    setVerifyTls(inst.verify_tls);
    setFormError(null);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const dto: UpdateInstanceDto = {
          name: name.trim(),
          base_url: url.trim(),
          verify_tls: verifyTls,
        };
        const trimmedToken = token.trim();
        if (trimmedToken !== "") {
          dto.access_token = trimmedToken;
        }
        await updateInstance(editing.id, dto);
      } else {
        const dto: CreateInstanceDto = {
          name: name.trim(),
          base_url: url.trim(),
          access_token: token.trim(),
          verify_tls: verifyTls,
        };
        await createInstance(dto);
      }
      setShowForm(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("instancesDeleteConfirm"))) return;
    try {
      await deleteInstance(id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function test(id: string) {
    setTestStates((s) => ({ ...s, [id]: "testing" }));
    try {
      const res = await testInstance(id);
      setTestStates((s) => ({ ...s, [id]: res.ok ? "ok" : "fail" }));
    } catch {
      setTestStates((s) => ({ ...s, [id]: "fail" }));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("instancesTitle")}
        </h1>
        <Button variant="primary" size="small" onClick={openAdd}>
          <Plus size={14} />
          {t("instancesAdd")}
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>
        )}
        {error && (
          <p className="text-sm text-red-400">
            {t("errorLoad")}: {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {instances.map((inst) => {
            const ts = testStates[inst.id] ?? "idle";
            return (
              <Card
                key={inst.id}
                className="flex items-center justify-between p-4"
              >
                <button
                  type="button"
                  className="flex cursor-pointer flex-col gap-0.5 text-left"
                  onClick={() => onSelectInstance(inst.id)}
                >
                  <span className="font-medium text-[var(--text-primary)]">
                    {inst.name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {inst.base_url}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {ts === "ok" && (
                    <CheckCircle size={16} className="text-green-400" />
                  )}
                  {ts === "fail" && (
                    <XCircle size={16} className="text-red-400" />
                  )}
                  <Button
                    size="small"
                    variant="default"
                    disabled={ts === "testing"}
                    onClick={() => test(inst.id)}
                  >
                    {ts === "testing"
                      ? t("instancesTesting")
                      : t("instancesTest")}
                  </Button>
                  <Button
                    size="small"
                    variant="default"
                    onClick={() => openEdit(inst)}
                  >
                    <Edit2 size={12} />
                  </Button>
                  <Button
                    size="small"
                    variant="default"
                    onClick={() => remove(inst.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-[440px] p-6">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              {editing ? t("instancesEditTitle") : t("instancesAddTitle")}
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="ha-inst-name"
                  className="mb-1 block text-xs text-[var(--text-secondary)]"
                >
                  {t("instancesName")}
                </label>
                <Input
                  id="ha-inst-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("instancesNamePlaceholder")}
                />
              </div>
              <div>
                <label
                  htmlFor="ha-inst-url"
                  className="mb-1 block text-xs text-[var(--text-secondary)]"
                >
                  {t("instancesUrl")}
                </label>
                <Input
                  id="ha-inst-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("instancesUrlPlaceholder")}
                />
              </div>
              <div>
                <label
                  htmlFor="ha-inst-token"
                  className="mb-1 block text-xs text-[var(--text-secondary)]"
                >
                  {t("instancesToken")}
                </label>
                <Input
                  id="ha-inst-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    editing
                      ? t("instancesTokenKeepPlaceholder")
                      : t("instancesTokenPlaceholder")
                  }
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
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="default" onClick={() => setShowForm(false)}>
                  {t("cancel")}
                </Button>
                <Button variant="primary" disabled={saving} onClick={save}>
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
