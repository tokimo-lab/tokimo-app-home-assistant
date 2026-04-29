import { Power } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function SwitchTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isOn = state === "on";
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
    <TileBaseStyle
      domain="switch"
      isOn={isOn}
      icon={<Power size={20} />}
      name={name}
      stateText={isOn ? t("stateOn") : t("stateOff")}
      onClick={toggle}
      onIconClick={toggle}
    />
  );
}

export const SwitchTile = memo(SwitchTileImpl, tilePropsEqual);
