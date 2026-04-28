import { Power } from "lucide-react";
import { memo } from "react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import { tilePropsEqual, type TileProps } from "./_types";
import { TileBase } from "./TileBase";

function SwitchTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isOn = state === "on";
  const gradient = getTileGradient("switch", state);
  const name = getFriendlyName(entity);

  function toggle() {
    onCall({
      entity_id,
      domain: "switch",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  return (
    <TileBase gradient={gradient} onClick={toggle}>
      <Power size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {isOn ? t("stateOn") : t("stateOff")}
        </p>
      </div>
    </TileBase>
  );
}

export const SwitchTile = memo(SwitchTileImpl, tilePropsEqual);
