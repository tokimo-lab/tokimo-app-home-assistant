export function getDomain(entity_id: string): string {
  return entity_id.split(".")[0] ?? entity_id;
}

export function isOnLike(state: string): boolean {
  return (
    state === "on" ||
    state === "open" ||
    state === "unlocked" ||
    state === "playing" ||
    state === "home" ||
    state === "active" ||
    state === "cleaning" ||
    state === "armed_away" ||
    state === "armed_home" ||
    state === "armed_night"
  );
}

export function isAvailable(state: string): boolean {
  return state !== "unavailable" && state !== "unknown";
}

/** Domains that support on/off toggle */
export const TOGGLE_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "input_boolean",
  "automation",
]);

/** Domains that are read-only sensors */
export const SENSOR_DOMAINS = new Set([
  "sensor",
  "binary_sensor",
  "sun",
  "weather",
  "person",
  "zone",
]);

export function getToggleService(domain: string, currentState: string): string {
  if (currentState === "on") {
    if (domain === "cover") return "close_cover";
    return "turn_off";
  }
  if (currentState === "open") return "close_cover";
  if (domain === "cover") return "open_cover";
  return "turn_on";
}
