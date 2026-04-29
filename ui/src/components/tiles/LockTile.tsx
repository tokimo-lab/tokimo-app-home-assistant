import { Lock, LockOpen } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function LockTileImpl({ entity, instanceId, t, onCall, size }: TileProps) {
  const { entity_id, state } = entity;
  const isLocked = state === "locked";
  const name = getFriendlyName(entity);
  const { openDetail } = useDetailOverlay();

  function toggle() {
    onCall({
      entity_id,
      domain: "lock",
      service: isLocked ? "unlock" : "lock",
      target: { entity_id },
      optimisticState: isLocked ? "unlocked" : "locked",
    });
  }

  return (
    <TileBaseStyle
      domain="lock"
      size={size}
      isOn={isLocked}
      icon={isLocked ? <Lock size={20} /> : <LockOpen size={20} />}
      name={name}
      stateText={isLocked ? t("stateLocked") : t("stateUnlocked")}
      onClick={toggle}
      onIconClick={toggle}
      onLongPress={() => openDetail(entity_id, instanceId)}
    />
  );
}

export const LockTile = memo(LockTileImpl, tilePropsEqual);
