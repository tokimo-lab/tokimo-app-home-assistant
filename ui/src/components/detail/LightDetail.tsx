import { useEffect, useState } from "react";
import { brightnessToPercent, percentToBrightness } from "../../lib/format";
import { VerticalSlider } from "./_helpers/VerticalSlider";
import type { DomainDetailProps } from "./_types";

const SUPPORTS_BRIGHTNESS = 1;
const SUPPORTS_COLOR = 16;
const SUPPORTS_COLOR_TEMP = 2;

const SWATCHES: Array<[string, [number, number, number]]> = [
  ["#ff6b6b", [255, 107, 107]],
  ["#ffa94d", [255, 169, 77]],
  ["#ffd43b", [255, 212, 59]],
  ["#69db7c", [105, 219, 124]],
  ["#4dabf7", [77, 171, 247]],
  ["#b197fc", [177, 151, 252]],
  ["#ffffff", [255, 255, 255]],
];

export function LightDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const supported = attributes.supported_features ?? 0;
  const hasBrightness =
    (supported & SUPPORTS_BRIGHTNESS) !== 0 || attributes.brightness != null;
  const hasColor = (supported & SUPPORTS_COLOR) !== 0;
  const hasColorTemp =
    (supported & SUPPORTS_COLOR_TEMP) !== 0 ||
    attributes.color_temp != null ||
    attributes.min_color_temp_kelvin != null;

  const externalPct =
    attributes.brightness != null
      ? brightnessToPercent(attributes.brightness)
      : isOn
        ? 100
        : 0;
  const [pct, setPct] = useState(externalPct);

  useEffect(() => {
    setPct(externalPct);
  }, [externalPct]);

  const commitBrightness = (value: number) => {
    if (value <= 0) {
      onCall({
        entity_id,
        domain: "light",
        service: "turn_off",
        target: { entity_id },
        optimisticState: "off",
      });
      return;
    }
    onCall({
      entity_id,
      domain: "light",
      service: "turn_on",
      target: { entity_id },
      data: { brightness: percentToBrightness(value) },
      optimisticState: "on",
      optimisticAttributes: { brightness: percentToBrightness(value) },
    });
  };

  const setColor = (rgb: [number, number, number]) => {
    onCall({
      entity_id,
      domain: "light",
      service: "turn_on",
      target: { entity_id },
      data: { rgb_color: rgb },
      optimisticState: "on",
      optimisticAttributes: { rgb_color: rgb },
    });
  };

  const minK = attributes.min_color_temp_kelvin ?? 2000;
  const maxK = attributes.max_color_temp_kelvin ?? 6500;
  const currentK = attributes.color_temp
    ? Math.round(1_000_000 / attributes.color_temp)
    : Math.round((minK + maxK) / 2);

  const setColorTemp = (kelvin: number) => {
    onCall({
      entity_id,
      domain: "light",
      service: "turn_on",
      target: { entity_id },
      data: { color_temp_kelvin: kelvin },
      optimisticState: "on",
    });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {hasBrightness ? (
        <VerticalSlider
          value={pct}
          min={0}
          max={100}
          onChange={setPct}
          onChangeEnd={commitBrightness}
          fillClassName="bg-gradient-to-t from-amber-300 to-amber-200"
          trackClassName="bg-zinc-200 dark:bg-zinc-800"
          ariaLabel={t("ha.detail.light.brightness")}
        >
          <span className="font-semibold text-2xl text-zinc-900 dark:text-zinc-100">
            {pct}%
          </span>
        </VerticalSlider>
      ) : (
        <button
          type="button"
          onClick={() =>
            onCall({
              entity_id,
              domain: "light",
              service: isOn ? "turn_off" : "turn_on",
              target: { entity_id },
              optimisticState: isOn ? "off" : "on",
            })
          }
          className={`flex h-40 w-40 cursor-pointer items-center justify-center rounded-full font-semibold text-lg shadow-lg transition active:scale-95 ${
            isOn
              ? "bg-amber-400 text-white"
              : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {isOn ? t("stateOn") : t("stateOff")}
        </button>
      )}

      {hasColor && (
        <div className="flex w-full flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("ha.detail.light.color")}
          </span>
          <div className="flex flex-wrap gap-3">
            {SWATCHES.map(([hex, rgb]) => {
              const active =
                attributes.rgb_color &&
                attributes.rgb_color[0] === rgb[0] &&
                attributes.rgb_color[1] === rgb[1] &&
                attributes.rgb_color[2] === rgb[2];
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(rgb)}
                  aria-label={hex}
                  className={`h-9 w-9 cursor-pointer rounded-full border-2 transition hover:scale-110 ${
                    active
                      ? "border-zinc-900 dark:border-white"
                      : "border-white/40 dark:border-zinc-700"
                  }`}
                  style={{ background: hex }}
                />
              );
            })}
          </div>
        </div>
      )}

      {hasColorTemp && (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t("ha.detail.light.colorTemp")}
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {currentK}K
            </span>
          </div>
          <input
            type="range"
            min={minK}
            max={maxK}
            step={50}
            value={currentK}
            onChange={(e) => setColorTemp(Number(e.target.value))}
            className="w-full cursor-pointer"
            aria-label={t("ha.detail.light.colorTemp")}
          />
        </div>
      )}
    </div>
  );
}
