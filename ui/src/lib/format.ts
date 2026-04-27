import type { EntityState } from "../types";

export function getFriendlyName(entity: EntityState): string {
  return (
    entity.display_name ??
    entity.override?.friendly_name ??
    entity.attributes.friendly_name ??
    entity.entity_id
  );
}

export function formatState(
  entity: EntityState,
  t: (k: string) => string,
): string {
  const { state, attributes } = entity;

  if (state === "unavailable") return t("stateUnavailable");
  if (state === "unknown") return t("stateUnknown");

  const domain = entity.entity_id.split(".")[0];

  switch (domain) {
    case "light":
      return state === "on"
        ? attributes.brightness != null
          ? `${Math.round((attributes.brightness / 255) * 100)}%`
          : t("stateOn")
        : t("stateOff");

    case "cover":
      if (state === "open") {
        return attributes.current_position != null
          ? `${attributes.current_position}%`
          : t("stateOpen");
      }
      if (state === "closed") return t("stateClosed");
      if (state === "opening") return t("stateOpening");
      if (state === "closing") return t("stateClosing");
      return state;

    case "climate": {
      const cur = attributes.current_temperature;
      const target = attributes.temperature;
      const unit = attributes.unit_of_measurement ?? "°";
      if (cur != null) return `${cur}${unit}`;
      if (target != null) return `${target}${unit}`;
      return state;
    }

    case "fan":
      return state === "on"
        ? attributes.percentage != null
          ? `${attributes.percentage}%`
          : t("stateOn")
        : t("stateOff");

    case "lock":
      return state === "locked" ? t("stateLocked") : t("stateUnlocked");

    case "media_player":
      if (state === "playing")
        return attributes.media_title ?? t("statePlaying");
      if (state === "paused") return t("statePaused");
      if (state === "idle") return t("stateIdle");
      if (state === "off") return t("stateOff");
      return state;

    case "vacuum":
      return t(`vacuumState_${state}`) !== `vacuumState_${state}`
        ? t(`vacuumState_${state}`)
        : state;

    case "sensor":
      return attributes.unit_of_measurement
        ? `${state} ${attributes.unit_of_measurement}`
        : state;

    case "switch":
    case "input_boolean":
      return state === "on" ? t("stateOn") : t("stateOff");

    default:
      return state;
  }
}

export function formatUnit(entity: EntityState): string {
  return entity.attributes.unit_of_measurement ?? "";
}

export function brightnessToPercent(brightness: number): number {
  return Math.round((brightness / 255) * 100);
}

export function percentToBrightness(percent: number): number {
  return Math.round((percent / 100) * 255);
}
