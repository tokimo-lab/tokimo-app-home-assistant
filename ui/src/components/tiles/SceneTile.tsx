import { PlaySquare } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function SceneTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id } = entity;
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
    <TileBaseStyle
      domain="scene"
      isOn={false}
      icon={<PlaySquare size={20} />}
      name={name}
      stateText={t("tileActivate")}
      onClick={activate}
    />
  );
}

export const SceneTile = memo(SceneTileImpl, tilePropsEqual);
