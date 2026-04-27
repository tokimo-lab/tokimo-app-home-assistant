import { Battery, Wind } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function VacuumTile({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isCleaning = state === "cleaning";
  const gradient = getTileGradient("vacuum", state);
  const name = getFriendlyName(entity);
  const battery = attributes.battery_level;

  function startOrDock() {
    onCall({
      entity_id,
      domain: "vacuum",
      service: isCleaning ? "return_to_base" : "start",
      target: { entity_id },
      optimisticState: isCleaning ? "returning" : "cleaning",
    });
  }

  const detail = (
    <div className="flex flex-col gap-3">
      {battery != null && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Battery size={16} />
          <span>{battery}%</span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 cursor-pointer rounded-lg bg-green-500/20 py-2 text-sm text-green-300 transition hover:bg-green-500/30"
          onClick={() =>
            onCall({
              entity_id,
              domain: "vacuum",
              service: "start",
              target: { entity_id },
              optimisticState: "cleaning",
            })
          }
        >
          {t("tileStart")}
        </button>
        <button
          type="button"
          className="flex-1 cursor-pointer rounded-lg bg-white/10 py-2 text-sm text-white/70 transition hover:bg-white/20"
          onClick={() =>
            onCall({
              entity_id,
              domain: "vacuum",
              service: "return_to_base",
              target: { entity_id },
              optimisticState: "returning",
            })
          }
        >
          {t("tileDock")}
        </button>
      </div>
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={startOrDock}
      detail={detail}
      detailTitle={name}
    >
      <div className="flex items-center justify-between">
        <Wind size={20} className="text-white/80" />
        {battery != null && (
          <span className="text-xs text-white/60">{battery}%</span>
        )}
      </div>
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {t(`vacuumState_${state}`) !== `vacuumState_${state}`
            ? t(`vacuumState_${state}`)
            : state}
        </p>
      </div>
    </TileBase>
  );
}
