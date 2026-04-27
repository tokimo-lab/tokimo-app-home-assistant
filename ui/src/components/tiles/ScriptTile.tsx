import { Cpu } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function ScriptTile({ entity, t, onCall }: TileProps) {
  const { entity_id, state } = entity;
  const isRunning = state === "on";
  const gradient = getTileGradient("script", isRunning ? "on" : "off");
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
    <TileBase gradient={gradient} onClick={run}>
      <Cpu size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {isRunning ? t("stateActive") : t("tileActivate")}
        </p>
      </div>
    </TileBase>
  );
}
