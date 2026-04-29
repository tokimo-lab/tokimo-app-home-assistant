import { Power } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function SwitchTileImpl({ entity, instanceId, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isOn = state === "on";
  const name = getFriendlyName(entity);
  const domain = entity_id.split(".")[0] ?? "switch";
  const { openDetail } = useDetailOverlay();

  function toggle() {
    onCall({
      entity_id,
      domain,
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  }

  return (
    <TileBaseStyle
      domain={domain}
      isOn={isOn}
      icon={<Power size={20} />}
      name={name}
      stateText={isOn ? t("stateOn") : t("stateOff")}
      onClick={toggle}
      onIconClick={toggle}
      onLongPress={() => openDetail(entity_id, instanceId)}
    />
  );
}

export const SwitchTile = memo(SwitchTileImpl, tilePropsEqual);
