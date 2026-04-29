import { Lightbulb } from "lucide-react";
import { memo } from "react";
import { brightnessToPercent, getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function LightTileImpl({ entity, instanceId, t, onCall, size }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const name = getFriendlyName(entity);
  const brightness = attributes.brightness
    ? brightnessToPercent(attributes.brightness)
    : null;
  const hasBrightness = attributes.brightness != null;
  const { openDetail } = useDetailOverlay();

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
      size={size}
      isOn={isOn}
      icon={<Lightbulb size={20} />}
      name={name}
      stateText={stateText}
      onClick={() => openDetail(entity_id, instanceId)}
      onIconClick={toggle}
      onLongPress={() => openDetail(entity_id, instanceId)}
    />
  );
}

export const LightTile = memo(LightTileImpl, tilePropsEqual);
