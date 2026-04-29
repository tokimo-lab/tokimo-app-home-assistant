import { Radio } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { formatNumeric } from "../../lib/format-number";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function SensorTileImpl({ entity, t: _t, size }: TileProps) {
  const { state, attributes } = entity;
  const name = getFriendlyName(entity);
  const unit = attributes.unit_of_measurement ?? "";
  const display = formatNumeric(state, entity.decimal_places, 1) ?? state;

  return (
    <TileBaseStyle
      domain="sensor"
      size={size}
      isOn={false}
      icon={<Radio size={16} />}
      name={name}
      stateText={`${display}${unit ? ` ${unit}` : ""}`}
    />
  );
}

export const SensorTile = memo(SensorTileImpl, tilePropsEqual);
