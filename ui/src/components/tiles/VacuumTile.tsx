import { Wind } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function VacuumTileImpl({ entity, t, onCall, size }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isCleaning = state === "cleaning";
  const name = getFriendlyName(entity);
  const battery = attributes.battery_level;

  function startOrDock() {
    onCall({
      entity_id,
      domain: "vacuum",
      service: isCleaning ? "return_to_base" : "start",
      target: { entity_id },
      optimisticState: isCleaning ? "returning" : "cleaning",
    });
  }

  const stateText =
    t(`vacuumState_${state}`) !== `vacuumState_${state}`
      ? t(`vacuumState_${state}`)
      : state;

  return (
    <TileBaseStyle
      domain="vacuum"
      size={size}
      isOn={isCleaning || state === "returning"}
      icon={<Wind size={20} />}
      name={name}
      stateText={battery != null ? `${stateText} · ${battery}%` : stateText}
      onClick={startOrDock}
    />
  );
}

export const VacuumTile = memo(VacuumTileImpl, tilePropsEqual);
