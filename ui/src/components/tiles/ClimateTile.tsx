import { Thermometer } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function ClimateTileImpl({ entity }: TileProps) {
  const { state, attributes } = entity;
  const name = getFriendlyName(entity);
  const currentTemp = attributes.current_temperature;
  const targetTemp = attributes.temperature;
  const isActive = state !== "off";

  const stateText =
    currentTemp != null && targetTemp != null
      ? `${currentTemp}° → ${targetTemp}°`
      : currentTemp != null
        ? `${currentTemp}°`
        : state;

  return (
    <TileBaseStyle
      domain="climate"
      isOn={isActive}
      icon={<Thermometer size={20} />}
      name={name}
      stateText={stateText}
    />
  );
}

export const ClimateTile = memo(ClimateTileImpl, tilePropsEqual);
