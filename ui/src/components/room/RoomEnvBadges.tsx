import { Droplet, Thermometer } from "lucide-react";
import { getDomain } from "../../lib/domain";
import type { EntityState } from "../../types";

interface RoomEnvBadgesProps {
  entities: EntityState[];
  t: (k: string) => string;
}

interface Range {
  min: number;
  max: number;
}

function computeRange(values: number[]): Range | null {
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function formatRange(range: Range, unit: string): string {
  const min = range.min.toFixed(1);
  const max = range.max.toFixed(1);
  return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
}

function collectByDeviceClass(
  entities: EntityState[],
  deviceClass: string,
): number[] {
  const out: number[] = [];
  for (const e of entities) {
    if (getDomain(e.entity_id) !== "sensor") continue;
    if (e.attributes.device_class !== deviceClass) continue;
    const raw = Number.parseFloat(e.state);
    if (Number.isFinite(raw)) out.push(raw);
  }
  return out;
}

/**
 * Top-of-room environment overview. Only renders when the room actually
 * contains temperature / humidity sensors. Climate entities are *not*
 * surfaced here — they get their own ClimateTile in the Climate section.
 */
export function RoomEnvBadges({ entities, t }: RoomEnvBadgesProps) {
  const tempRange = computeRange(collectByDeviceClass(entities, "temperature"));
  const humRange = computeRange(collectByDeviceClass(entities, "humidity"));

  if (!tempRange && !humRange) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tempRange && (
        <div className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">
          <Thermometer size={14} />
          <span>
            {t("roomEnvTemperature")} {formatRange(tempRange, "°")}
          </span>
        </div>
      )}
      {humRange && (
        <div className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">
          <Droplet size={14} />
          <span>
            {t("roomEnvHumidity")} {formatRange(humRange, "%")}
          </span>
        </div>
      )}
    </div>
  );
}
