import { Activity, Droplet, Gauge, Sun, Thermometer, Wind } from "lucide-react";
import type { ComponentType } from "react";
import { getDomain } from "../../lib/domain";
import { formatNumeric } from "../../lib/format-number";
import type { EntityState } from "../../types";

interface RoomEnvBadgesProps {
  entities: EntityState[];
  t: (k: string) => string;
}

interface BadgeSpec {
  deviceClass: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  defaultUnit: string;
  /** Decimal places when the value is finite. */
  digits: number;
}

/**
 * Recognised environmental sensor device_classes, in display order.
 * Matches Apple Home's per-room env strip (IMG_2655).
 */
const ENV_BADGES: ReadonlyArray<BadgeSpec> = [
  {
    deviceClass: "temperature",
    icon: Thermometer,
    defaultUnit: "°C",
    digits: 1,
  },
  { deviceClass: "humidity", icon: Droplet, defaultUnit: "%", digits: 0 },
  { deviceClass: "pm25", icon: Wind, defaultUnit: "µg/m³", digits: 0 },
  { deviceClass: "pm10", icon: Wind, defaultUnit: "µg/m³", digits: 0 },
  { deviceClass: "co2", icon: Activity, defaultUnit: "ppm", digits: 0 },
  { deviceClass: "pressure", icon: Gauge, defaultUnit: "hPa", digits: 0 },
  { deviceClass: "illuminance", icon: Sun, defaultUnit: "lx", digits: 0 },
  { deviceClass: "aqi", icon: Activity, defaultUnit: "", digits: 0 },
];

/**
 * Returns the first sensor entity in `entities` whose device_class
 * matches `deviceClass`. Per spec we intentionally pick the first
 * (deterministic, avoids cluttering the badge row when a room has
 * multiple sensors of the same kind).
 */
function firstSensor(
  entities: EntityState[],
  deviceClass: string,
): EntityState | undefined {
  for (const e of entities) {
    if (getDomain(e.entity_id) !== "sensor") continue;
    if (e.attributes.device_class === deviceClass) return e;
  }
  return undefined;
}

function formatValue(
  raw: string,
  override: number | null | undefined,
  digits: number,
): string {
  return formatNumeric(raw, override, digits) ?? raw;
}

/**
 * Top-of-room environment overview. Renders only when at least one
 * recognised env sensor exists in the room. Climate entities are
 * surfaced separately as their own ClimateTile section.
 */
export function RoomEnvBadges({ entities, t: _t }: RoomEnvBadgesProps) {
  const items = ENV_BADGES.map((spec) => {
    const sensor = firstSensor(entities, spec.deviceClass);
    if (!sensor) return null;
    const unit = sensor.attributes.unit_of_measurement ?? spec.defaultUnit;
    return {
      key: spec.deviceClass,
      Icon: spec.icon,
      value: formatValue(sensor.state, sensor.decimal_places, spec.digits),
      unit,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(({ key, Icon, value, unit }) => (
        <div
          key={key}
          className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300"
        >
          <Icon size={14} />
          <span className="font-medium tabular-nums">
            {value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
