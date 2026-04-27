import { Zap } from "lucide-react";
import { formatState, getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

// Binary sensor active = motion/door/window open → orange
// inactive = neutral
export function BinarySensorTile({ entity, t }: TileProps) {
  const { state } = entity;
  const isActive = state === "on";
  const name = getFriendlyName(entity);

  const gradient = isActive
    ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
    : "linear-gradient(135deg, #374151 0%, #1f2937 100%)";

  return (
    <TileBase gradient={gradient} disabled={true}>
      <Zap size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">{formatState(entity, t)}</p>
      </div>
    </TileBase>
  );
}
