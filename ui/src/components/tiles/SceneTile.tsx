import { PlaySquare } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function SceneTile({ entity, t, onCall }: TileProps) {
  const { entity_id } = entity;
  const gradient = getTileGradient("scene", "on");
  const name = getFriendlyName(entity);

  function activate() {
    onCall({
      entity_id,
      domain: "scene",
      service: "turn_on",
      target: { entity_id },
    });
  }

  return (
    <TileBase gradient={gradient} onClick={activate}>
      <PlaySquare size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">{t("tileActivate")}</p>
      </div>
    </TileBase>
  );
}
