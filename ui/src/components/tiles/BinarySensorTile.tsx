import { Zap } from "lucide-react";
import { memo } from "react";
import { formatState, getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function BinarySensorTileImpl({ entity, t }: TileProps) {
  const { state } = entity;
  const isActive = state === "on";
  const name = getFriendlyName(entity);

  return (
    <TileBaseStyle
      domain="binary_sensor"
      isOn={isActive}
      icon={<Zap size={20} />}
      name={name}
      stateText={formatState(entity, t)}
    />
  );
}

export const BinarySensorTile = memo(BinarySensorTileImpl, tilePropsEqual);
