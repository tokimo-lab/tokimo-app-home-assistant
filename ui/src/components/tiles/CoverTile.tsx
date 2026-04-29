import { Blinds } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function CoverTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOpen = state === "open";
  const name = getFriendlyName(entity);
  const position = attributes.current_position;

  function toggle() {
    onCall({
      entity_id,
      domain: "cover",
      service: isOpen ? "close_cover" : "open_cover",
      target: { entity_id },
      optimisticState: isOpen ? "closed" : "open",
    });
  }

  const stateText =
    position != null
      ? `${position}%`
      : isOpen
        ? t("stateOpen")
        : t("stateClosed");

  return (
    <TileBaseStyle
      domain="cover"
      isOn={!isOpen}
      icon={<Blinds size={20} />}
      name={name}
      stateText={stateText}
      onClick={toggle}
      onIconClick={toggle}
    />
  );
}

export const CoverTile = memo(CoverTileImpl, tilePropsEqual);
