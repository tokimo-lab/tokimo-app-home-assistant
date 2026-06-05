import {
  Activity,
  Droplets,
  Gauge,
  Sun,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatNumeric } from "../../lib/format-number";
import type { DomainDetailProps } from "./_types";

const DEVICE_CLASS_ICON: Record<
  string,
  ComponentType<{ size?: number; className?: string }>
> = {
  temperature: Thermometer,
  humidity: Droplets,
  illuminance: Sun,
  power: Zap,
  energy: Zap,
  pressure: Gauge,
  wind_speed: Wind,
};

export function SensorDetail({ entity, t }: DomainDetailProps) {
  const { state, attributes } = entity;
  const unit =
    typeof attributes.unit_of_measurement === "string"
      ? attributes.unit_of_measurement
      : "";
  const deviceClass =
    typeof attributes.device_class === "string" ? attributes.device_class : "";
  const Icon = DEVICE_CLASS_ICON[deviceClass] ?? Activity;

  const isUnknown = state === "unknown" || state === "unavailable";
  const formatted = formatNumeric(state, entity.decimal_places, 1);
  const display = isUnknown
    ? t(`state${capitalize(state)}`) || state
    : (formatted ?? state);

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Icon size={48} className="text-fg-muted" />
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-5xl text-fg-primary tabular-nums">
          {display}
        </span>
        {!isUnknown && unit && (
          <span className="font-medium text-2xl text-fg-secondary">
            {unit}
          </span>
        )}
      </div>
      {deviceClass && (
        <p className="text-xs font-medium text-fg-secondary uppercase tracking-wide">
          {deviceClass}
        </p>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
