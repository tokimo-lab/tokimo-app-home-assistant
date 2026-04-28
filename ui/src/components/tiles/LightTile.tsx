import { Lightbulb } from "lucide-react";
import { memo } from "react";
import { getTileGradient } from "../../lib/colors";
import {
  brightnessToPercent,
  getFriendlyName,
  percentToBrightness,
} from "../../lib/format";
import { tilePropsEqual, type TileProps } from "./_types";
import { TileBase } from "./TileBase";

const SUPPORTS_BRIGHTNESS = 1;
const SUPPORTS_COLOR = 16;

function LightTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const gradient = getTileGradient("light", state);
  const name = getFriendlyName(entity);
  const brightness = attributes.brightness
    ? brightnessToPercent(attributes.brightness)
    : 100;
  const supportsFeatures = attributes.supported_features ?? 0;
  const hasBrightness =
    (supportsFeatures & SUPPORTS_BRIGHTNESS) !== 0 ||
    attributes.brightness != null;

  function toggle() {
    onCall({
      entity_id,
      domain: "light",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  const detail = (
    <div className="flex flex-col gap-4">
      {hasBrightness && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">
              {t("tileBrightness")}
            </span>
            <span className="font-medium text-[var(--text-primary)]">
              {brightness}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={brightness}
            className="w-full cursor-pointer accent-amber-400"
            onChange={(e) => {
              const pct = Number(e.target.value);
              onCall({
                entity_id,
                domain: "light",
                service: "turn_on",
                target: { entity_id },
                data: { brightness: percentToBrightness(pct) },
                optimisticState: "on",
                optimisticAttributes: { brightness: percentToBrightness(pct) },
              });
            }}
          />
        </div>
      )}
      {(supportsFeatures & SUPPORTS_COLOR) !== 0 && attributes.rgb_color && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Color</span>
          <div className="flex gap-2">
            {["#ff6600", "#ffcc00", "#ffffff", "#0066ff", "#cc00ff"].map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 w-7 cursor-pointer rounded-full border-2 border-white/20 transition hover:scale-110"
                  style={{ background: c }}
                  onClick={() =>
                    onCall({
                      entity_id,
                      domain: "light",
                      service: "turn_on",
                      target: { entity_id },
                      data: { rgb_color: hexToRgb(c) },
                      optimisticState: "on",
                    })
                  }
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={toggle}
      detail={hasBrightness ? detail : undefined}
      detailTitle={name}
    >
      <Lightbulb size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {isOn
            ? hasBrightness
              ? `${brightness}%`
              : t("stateOn")
            : t("stateOff")}
        </p>
      </div>
    </TileBase>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const LightTile = memo(LightTileImpl, tilePropsEqual);
