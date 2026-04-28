import { Thermometer } from "lucide-react";
import { memo } from "react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBase } from "./TileBase";

function ClimateTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const gradient = getTileGradient("climate", state);
  const name = getFriendlyName(entity);
  const currentTemp = attributes.current_temperature;
  const targetTemp = attributes.temperature;
  const minTemp = attributes.min_temp ?? 15;
  const maxTemp = attributes.max_temp ?? 30;
  const hvacModes = attributes.hvac_modes ?? ["off", "heat", "cool", "auto"];

  const detail = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">
            {t("tileTargetTemp")}
          </span>
          <span className="font-medium text-[var(--text-primary)]">
            {targetTemp ?? "--"}°
          </span>
        </div>
        <input
          type="range"
          min={minTemp}
          max={maxTemp}
          step={0.5}
          value={targetTemp ?? minTemp}
          className="w-full cursor-pointer accent-teal-400"
          onChange={(e) => {
            const temp = Number(e.target.value);
            onCall({
              entity_id,
              domain: "climate",
              service: "set_temperature",
              target: { entity_id },
              data: { temperature: temp },
              optimisticAttributes: { temperature: temp },
            });
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-secondary)]">
          {t("tileHvacMode")}
        </span>
        <div className="flex flex-wrap gap-2">
          {hvacModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`cursor-pointer rounded-lg px-3 py-1 text-xs transition ${
                state === mode
                  ? "bg-teal-500 text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
              onClick={() =>
                onCall({
                  entity_id,
                  domain: "climate",
                  service: "set_hvac_mode",
                  target: { entity_id },
                  data: { hvac_mode: mode },
                  optimisticState: mode,
                })
              }
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={() => undefined}
      detail={detail}
      detailTitle={name}
    >
      <Thermometer size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {currentTemp != null
            ? `${currentTemp}° → ${targetTemp ?? "--"}°`
            : state}
        </p>
      </div>
    </TileBase>
  );
}

export const ClimateTile = memo(ClimateTileImpl, tilePropsEqual);
