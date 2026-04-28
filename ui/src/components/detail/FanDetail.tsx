import { Fan, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { VerticalSlider } from "./_helpers/VerticalSlider";
import type { DomainDetailProps } from "./_types";

export function FanDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";

  const externalPct =
    typeof attributes.percentage === "number" ? attributes.percentage : 0;
  const presetMode =
    typeof attributes.preset_mode === "string" ? attributes.preset_mode : "";
  const presetModes = Array.isArray(attributes.preset_modes)
    ? attributes.preset_modes.filter((m): m is string => typeof m === "string")
    : [];

  const [pct, setPct] = useState(externalPct);

  useEffect(() => {
    setPct(externalPct);
  }, [externalPct]);

  const commitPct = (value: number) => {
    onCall({
      entity_id,
      domain: "fan",
      service: "set_percentage",
      target: { entity_id },
      data: { percentage: value },
      optimisticState: value > 0 ? "on" : "off",
      optimisticAttributes: { percentage: value },
    });
  };

  const togglePower = () => {
    onCall({
      entity_id,
      domain: "fan",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  };

  const selectPreset = (mode: string) => {
    onCall({
      entity_id,
      domain: "fan",
      service: "set_preset_mode",
      target: { entity_id },
      data: { preset_mode: mode },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <VerticalSlider
        value={pct}
        min={0}
        max={100}
        onChange={setPct}
        onChangeEnd={commitPct}
        ariaLabel={t("detailFanSpeed")}
        fillClassName="bg-sky-400"
        trackClassName="bg-zinc-200 dark:bg-zinc-800"
      >
        <div className="flex flex-col items-center gap-1 text-zinc-700 dark:text-zinc-100">
          <Fan
            size={36}
            className={
              isOn ? "motion-safe:animate-spin [animation-duration:2s]" : ""
            }
          />
          <span className="font-semibold text-lg tabular-nums">{pct}%</span>
        </div>
      </VerticalSlider>

      <button
        type="button"
        onClick={togglePower}
        aria-pressed={isOn}
        aria-label={
          isOn ? t("detailFanTurnOff") : t("detailFanTurnOn")
        }
        className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full shadow transition active:scale-95 ${
          isOn
            ? "bg-sky-500 text-white hover:bg-sky-600"
            : "bg-zinc-200 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        }`}
      >
        <Power size={20} />
      </button>

      {presetModes.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <p className="text-center text-xs font-medium text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
            {t("detailFanPresetMode")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {presetModes.map((mode) => {
              const active = mode === presetMode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectPreset(mode)}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-sky-500 text-white shadow"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
