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
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Battery size={28} />
            <span className="font-semibold text-4xl tabular-nums">
              {battery}%
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t(`ha.detail.vacuum.state.${state}`) || state}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => call("start", "cleaning")}
          aria-label={t("ha.detail.vacuum.start")}
          className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-full shadow transition active:scale-95 ${
            isCleaning
              ? "bg-emerald-500 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => call("pause", "paused")}
          aria-label={t("ha.detail.vacuum.pause")}
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-700 shadow transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <Pause size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => call("return_to_base", "returning")}
          aria-label={t("ha.detail.vacuum.returnToBase")}
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-700 shadow transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <Home size={22} />
        </button>
      </div>
    </div>
  );
}
