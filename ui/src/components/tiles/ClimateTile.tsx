import { Thermometer } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
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

  const stateText =
    currentTemp != null && targetTemp != null
      ? `${currentTemp}° → ${targetTemp}°`
      : currentTemp != null
        ? `${currentTemp}°`
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
