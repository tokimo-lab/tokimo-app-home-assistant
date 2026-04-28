import { Radio } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { tilePropsEqual, type TileProps } from "./_types";
import { TileBase } from "./TileBase";

function SensorTileImpl({ entity, t: _t }: TileProps) {
  const { state, attributes } = entity;
  const name = getFriendlyName(entity);
  const unit = attributes.unit_of_measurement ?? "";

  const gradient = "linear-gradient(135deg, #374151 0%, #1f2937 100%)";

  return (
    <TileBase gradient={gradient} disabled={true}>
      <Radio size={16} className="text-white/50" />
      <div>
        <p className="truncate text-xs text-white/60">{name}</p>
        <p className="text-lg font-bold text-white leading-tight">
          {state}
          {unit && (
            <span className="text-xs font-normal text-white/60 ml-1">
              {unit}
            </span>
          )}
        </p>
      </div>
    </TileBase>
  );
}

export const SensorTile = memo(SensorTileImpl, tilePropsEqual);
