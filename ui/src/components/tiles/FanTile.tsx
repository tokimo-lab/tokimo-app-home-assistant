import { Fan } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function FanTile({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const gradient = getTileGradient("fan", state);
  const name = getFriendlyName(entity);
  const percentage = attributes.percentage ?? 0;
  const oscillating = attributes.oscillating ?? false;

  function toggle() {
    onCall({
      entity_id,
      domain: "fan",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  const detail = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">
            {t("tileFanSpeed")}
          </span>
          <span className="font-medium text-[var(--text-primary)]">
            {percentage}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={attributes.percentage_step ?? 1}
          value={percentage}
          className="w-full cursor-pointer accent-sky-400"
          onChange={(e) => {
            const pct = Number(e.target.value);
            onCall({
              entity_id,
              domain: "fan",
              service: "set_percentage",
              target: { entity_id },
              data: { percentage: pct },
              optimisticState: pct > 0 ? "on" : "off",
              optimisticAttributes: { percentage: pct },
            });
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">
          {t("tileOscillate")}
        </span>
        <button
          type="button"
          className={`cursor-pointer rounded-full px-3 py-1 text-xs transition ${
            oscillating
              ? "bg-sky-500 text-white"
              : "bg-white/10 text-white/70 hover:bg-white/20"
          }`}
          onClick={() =>
            onCall({
              entity_id,
              domain: "fan",
              service: "oscillate",
              target: { entity_id },
              data: { oscillating: !oscillating },
              optimisticAttributes: { oscillating: !oscillating },
            })
          }
        >
          {oscillating ? t("stateOn") : t("stateOff")}
        </button>
      </div>
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={toggle}
      detail={detail}
      detailTitle={name}
    >
      <Fan
        size={20}
        className={`text-white/80 ${isOn ? "animate-spin" : ""}`}
        style={{ animationDuration: "2s" }}
      />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {isOn ? `${percentage}%` : t("stateOff")}
        </p>
      </div>
    </TileBase>
  );
}
