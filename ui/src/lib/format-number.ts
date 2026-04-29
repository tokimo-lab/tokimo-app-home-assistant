/**
 * Format a numeric entity state with user-overridable decimal precision.
 *
 * HA pushes raw float strings like `"23.989860534668"` for sensor states.
 * Each entity's user-chosen precision (per-entity setting on the Accessory
 * Settings page, persisted as `entity_overrides.decimal_places`) takes
 * precedence; otherwise we fall back to a sensible per-call default
 * (typically 1 for temperatures, 0 for percentage-style fields).
 *
 * Returns `null` when the input cannot be parsed as a finite number, so
 * call sites can decide whether to show the raw value (e.g. `"unavailable"`)
 * or a placeholder.
 */
export function formatNumeric(
  raw: string | number | null | undefined,
  override: number | null | undefined,
  fallback = 1,
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;

  const places = clampPlaces(override ?? fallback);
  return n.toFixed(places);
}

function clampPlaces(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  if (i > 4) return 4;
  return i;
}
