import { Cpu } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function ScriptTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isRunning = state === "on";
  const name = getFriendlyName(entity);

  function run() {
    onCall({
      entity_id,
      domain: "script",
      service: "turn_on",
      target: { entity_id },
    });
  }

  return (
    <TileBaseStyle
      domain="script"
      isOn={isRunning}
      icon={<Cpu size={20} />}
      name={name}
      stateText={isRunning ? t("stateActive") : t("tileActivate")}
      onClick={run}
    />
  );
}

export const ScriptTile = memo(ScriptTileImpl, tilePropsEqual);
