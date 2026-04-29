import { Fan } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function FanTileImpl({ entity, instanceId, t, onCall, size }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOn = state === "on";
  const name = getFriendlyName(entity);
  const percentage = attributes.percentage ?? 0;
  const { openDetail } = useDetailOverlay();

  function toggle() {
    onCall({
      entity_id,
      domain: "fan",
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  return (
    <TileBaseStyle
      domain="fan"
      size={size}
      isOn={isOn}
      icon={
        <Fan
          size={20}
          className={isOn ? "animate-spin" : ""}
          style={{ animationDuration: "2s" }}
        />
      }
      name={name}
      stateText={isOn ? `${percentage}%` : t("stateOff")}
      onClick={() => openDetail(entity_id, instanceId)}
      onIconClick={toggle}
      onLongPress={() => openDetail(entity_id, instanceId)}
    />
  );
}

export const FanTile = memo(FanTileImpl, tilePropsEqual);
