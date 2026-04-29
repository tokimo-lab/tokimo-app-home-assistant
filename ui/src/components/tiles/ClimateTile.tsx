import { Thermometer } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { formatNumeric } from "../../lib/format-number";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function ClimateTileImpl({ entity, instanceId, size }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const name = getFriendlyName(entity);
  const currentTemp = attributes.current_temperature;
  const targetTemp = attributes.temperature;
  const isActive = state !== "off";
  const { openDetail } = useDetailOverlay();

  const curStr =
    currentTemp != null
      ? (formatNumeric(currentTemp, entity.decimal_places, 1) ??
        String(currentTemp))
      : null;
  const tgtStr =
    targetTemp != null
      ? (formatNumeric(targetTemp, entity.decimal_places, 1) ??
        String(targetTemp))
      : null;

  const stateText =
    curStr != null && tgtStr != null
      ? `${curStr}° → ${tgtStr}°`
      : curStr != null
        ? `${curStr}°`
        : state;

  // Climate has no clean on/off toggle (modes vary by device); both single-tap
  // and long-press open the detail overlay where the user can pick mode/temp.
  const open = () => openDetail(entity_id, instanceId);

  return (
    <TileBaseStyle
      domain="climate"
      size={size}
      isOn={isActive}
      icon={<Thermometer size={20} />}
      name={name}
      stateText={stateText}
      onClick={open}
      onLongPress={open}
    />
  );
}

export const ClimateTile = memo(ClimateTileImpl, tilePropsEqual);
