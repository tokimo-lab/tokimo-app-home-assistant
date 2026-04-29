import { Lightbulb } from "lucide-react";
import { memo } from "react";
import { brightnessToPercent, getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function LightTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const name = getFriendlyName(entity);
  const brightness = attributes.brightness
    ? brightnessToPercent(attributes.brightness)
    : null;
  const hasBrightness = attributes.brightness != null;

  function toggle() {
    onCall({
      entity_id,
      domain: "light",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  const stateText = isOn
    ? hasBrightness
      ? `${brightness}%`
      : t("stateOn")
    : t("stateOff");

  return (
    <TileBaseStyle
      domain="light"
      isOn={isOn}
      icon={<Lightbulb size={20} />}
      name={name}
      stateText={stateText}
      onClick={toggle}
      onIconClick={toggle}
    />
  );
}

export const LightTile = memo(LightTileImpl, tilePropsEqual);
