import { Battery, Home, Pause, Play } from "lucide-react";
import type { DomainDetailProps } from "./_types";

export function VacuumDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state, attributes } = entity;
  const battery =
    typeof attributes.battery_level === "number"
      ? Math.round(attributes.battery_level)
      : null;
  const isCleaning = state === "cleaning" || state === "returning";

  const call = (service: string, optimistic?: string) => {
    onCall({
      entity_id,
      domain: "vacuum",
      service,
      target: { entity_id },
      optimisticState: optimistic,
    });
  };

  return (
    <div className="flex flex-col items-center gap-8 py-4">
      {battery != null && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-fg-primary">
            <Battery size={28} />
            <span className="font-semibold text-4xl tabular-nums">
              {battery}%
            </span>
          </div>
          <p className="text-sm text-fg-secondary">
            {(() => {
              const key = `detailVacuumState${state.charAt(0).toUpperCase()}${state.slice(1)}`;
              const v = t(key);
              return v === key ? state : v;
            })()}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => call("start", "cleaning")}
          aria-label={t("detailVacuumStart")}
          className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-full shadow transition active:scale-95 ${
            isCleaning
              ? "bg-emerald-500 text-white"
              : "bg-surface-raised text-fg-primary hover:bg-surface-raised"
          }`}
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => call("pause", "paused")}
          aria-label={t("detailVacuumPause")}
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-surface-raised text-fg-primary shadow transition hover:bg-surface-raised active:scale-95"
        >
          <Pause size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => call("return_to_base", "returning")}
          aria-label={t("detailVacuumReturnToBase")}
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-surface-raised text-fg-primary shadow transition hover:bg-surface-raised active:scale-95"
        >
          <Home size={22} />
        </button>
      </div>
    </div>
  );
}
