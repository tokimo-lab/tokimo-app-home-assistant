import { Radio } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function SensorTileImpl({ entity, t: _t }: TileProps) {
  const { state, attributes } = entity;
  const name = getFriendlyName(entity);
  const unit = attributes.unit_of_measurement ?? "";

  return (
    <TileBaseStyle
      domain="sensor"
      isOn={false}
      icon={<Radio size={16} />}
      name={name}
      stateText={`${state}${unit ? ` ${unit}` : ""}`}
    />
  );
}

export const SensorTile = memo(SensorTileImpl, tilePropsEqual);
