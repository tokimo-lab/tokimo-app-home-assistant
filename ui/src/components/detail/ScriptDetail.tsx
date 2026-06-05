import { Play } from "lucide-react";
import type { DomainDetailProps } from "./_types";

function formatRelativeTime(iso: string, t: (k: string) => string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("detailScriptJustNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function ScriptDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, attributes } = entity;
  const lastTriggered =
    typeof attributes.last_triggered === "string"
      ? attributes.last_triggered
      : "";
  const relative = lastTriggered ? formatRelativeTime(lastTriggered, t) : "";

  const trigger = () => {
    onCall({
      entity_id,
      domain: "script",
      service: "turn_on",
      target: { entity_id },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <button
        type="button"
        onClick={trigger}
        aria-label={t("detailScriptRun")}
        className="flex h-40 w-40 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 active:scale-95"
      >
        <Play size={64} strokeWidth={1.5} fill="currentColor" />
      </button>
      <p className="font-medium text-base text-fg-primary">
        {t("detailScriptTapToRun")}
      </p>
      {relative && (
        <p className="text-sm text-fg-secondary">
          {t("detailScriptLastRun")}: {relative}
        </p>
      )}
    </div>
  );
}
