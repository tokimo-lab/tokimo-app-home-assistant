import { Lock, LockOpen } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function LockTile({ entity, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isLocked = state === "locked";
  const gradient = getTileGradient("lock", state);
  const name = getFriendlyName(entity);

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
    <TileBase gradient={gradient} onClick={toggle}>
      {isLocked ? (
        <Lock size={20} className="text-white/80" />
      ) : (
        <LockOpen size={20} className="text-white/80" />
      )}
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {isLocked ? t("stateLocked") : t("stateUnlocked")}
        </p>
      </div>
    </TileBase>
  );
}
