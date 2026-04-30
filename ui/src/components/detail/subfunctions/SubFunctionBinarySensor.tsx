/**
 * Binary sensor display (on/off text based on device_class).
 */
import type { EntityState } from "../../../types";

interface SubFunctionBinarySensorProps {
  entity: EntityState;
  t: (k: string) => string;
}

export function SubFunctionBinarySensor({
  entity,
  t,
}: SubFunctionBinarySensorProps) {
  const { state, attributes } = entity;
  const deviceClass =
    typeof attributes.device_class === "string" ? attributes.device_class : "";

  let displayText = state === "on" ? t("stateOn") : t("stateOff");

  // Special handling for common device_classes
  if (deviceClass === "motion") {
    displayText = state === "on" ? t("stateMotionDetected") : t("stateClear");
  } else if (deviceClass === "occupancy") {
    displayText = state === "on" ? t("stateOccupied") : t("stateClear");
  } else if (deviceClass === "presence") {
    displayText = state === "on" ? t("stateHome") : t("stateAway");
  } else if (deviceClass === "door" || deviceClass === "window") {
    displayText = state === "on" ? t("stateOpen") : t("stateClosed");
  }

  return (
    <span className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
      {displayText}
    </span>
  );
}
