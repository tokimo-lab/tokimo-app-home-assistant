import { cn } from "@tokimo/ui";
import {
  Blinds,
  Lightbulb,
  Lock,
  Speaker,
  Thermometer,
  Wind,
} from "lucide-react";
import type { FC, ReactNode } from "react";
import { getDomain } from "../../lib/domain";
import type { ChipId } from "../../state/useFilterChip";
import type { EntityState } from "../../types";

interface DomainSummaryBadgeProps {
  chipId: ChipId;
  entities: ReadonlyMap<string, EntityState>;
  t: (k: string) => string;
}

interface BadgeData {
  key: string;
  icon: FC<{ size?: number; className?: string }>;
  label: string;
}

function climateBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  const temps: number[] = [];
  const hums: number[] = [];
  for (const e of entities.values()) {
    const d = getDomain(e.entity_id);
    if (d === "climate") {
      const cur = e.attributes?.current_temperature;
      if (typeof cur === "number") temps.push(cur);
    } else if (d === "sensor") {
      const v = Number.parseFloat(e.state);
      if (Number.isNaN(v)) continue;
      if (e.attributes?.device_class === "temperature") temps.push(v);
      else if (e.attributes?.device_class === "humidity") hums.push(v);
    }
  }
  const out: BadgeData[] = [];
  if (temps.length > 0) {
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    out.push({
      key: "temp",
      icon: Thermometer,
      label:
        Math.abs(max - min) < 0.1
          ? `${t("summaryTemperature")} ${min.toFixed(1)}°`
          : `${t("summaryTemperature")} ${min.toFixed(1)}–${max.toFixed(1)}°`,
    });
  }
  if (hums.length > 0) {
    const min = Math.min(...hums);
    const max = Math.max(...hums);
    out.push({
      key: "hum",
      icon: Thermometer,
      label:
        Math.abs(max - min) < 0.5
          ? `${t("summaryHumidity")} ${Math.round(min)}%`
          : `${t("summaryHumidity")} ${Math.round(min)}–${Math.round(max)}%`,
    });
  }
  return out;
}

function lightsBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let on = 0;
  for (const e of entities.values()) {
    if (getDomain(e.entity_id) === "light" && e.state === "on") on += 1;
  }
  if (on === 0) return [];
  return [
    {
      key: "lights",
      icon: Lightbulb,
      label: `${on} ${t("summaryLightsOn")}`,
    },
  ];
}

function securityBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let unlocked = 0;
  let alerts = 0;
  for (const e of entities.values()) {
    const d = getDomain(e.entity_id);
    if (d === "lock" && e.state === "unlocked") unlocked += 1;
    if (d === "binary_sensor" && e.state === "on") {
      const dc = e.attributes?.device_class;
      if (
        typeof dc === "string" &&
        (dc === "door" || dc === "window" || dc === "motion" || dc === "smoke")
      ) {
        alerts += 1;
      }
    }
  }
  const out: BadgeData[] = [];
  if (unlocked > 0) {
    out.push({
      key: "unlocked",
      icon: Lock,
      label: `${unlocked} ${t("summaryUnlocked")}`,
    });
  }
  if (alerts > 0) {
    out.push({
      key: "alerts",
      icon: Lock,
      label: `${alerts} ${t("summaryAlerts")}`,
    });
  }
  if (out.length === 0) {
    out.push({ key: "secure", icon: Lock, label: t("summarySecure") });
  }
  return out;
}

function speakersBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let playing = 0;
  for (const e of entities.values()) {
    if (getDomain(e.entity_id) === "media_player" && e.state === "playing") {
      playing += 1;
    }
  }
  if (playing === 0) return [];
  return [
    {
      key: "playing",
      icon: Speaker,
      label: `${playing} ${t("summaryPlaying")}`,
    },
  ];
}

function coversBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let open = 0;
  for (const e of entities.values()) {
    if (getDomain(e.entity_id) === "cover" && e.state === "open") open += 1;
  }
  if (open === 0) return [];
  return [
    {
      key: "open",
      icon: Blinds,
      label: `${open} ${t("summaryCoversOpen")}`,
    },
  ];
}

function switchesBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let on = 0;
  for (const e of entities.values()) {
    const d = getDomain(e.entity_id);
    if ((d === "switch" || d === "input_boolean") && e.state === "on") on += 1;
  }
  if (on === 0) return [];
  return [
    { key: "on", icon: Lock, label: `${on} ${t("summarySwitchesOn")}` },
  ];
}

function fansBadges(
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  let on = 0;
  for (const e of entities.values()) {
    if (getDomain(e.entity_id) === "fan" && e.state === "on") on += 1;
  }
  if (on === 0) return [];
  return [
    { key: "fans", icon: Wind, label: `${on} ${t("summaryFansOn")}` },
  ];
}

function computeBadges(
  chipId: ChipId,
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): BadgeData[] {
  switch (chipId) {
    case "climate":
      return climateBadges(entities, t);
    case "lights":
      return lightsBadges(entities, t);
    case "security":
      return securityBadges(entities, t);
    case "speakers_tvs":
      return speakersBadges(entities, t);
    case "covers":
      return coversBadges(entities, t);
    case "switches":
      return switchesBadges(entities, t);
    case "fans":
      return fansBadges(entities, t);
  }
}

export function DomainSummaryBadge({
  chipId,
  entities,
  t,
}: DomainSummaryBadgeProps): ReactNode {
  const badges = computeBadges(chipId, entities, t);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {badges.map((b) => {
        const Icon = b.icon;
        return (
          <div
            key={b.key}
            className={cn(
              "flex items-center gap-2 text-sm text-[var(--text-secondary)]",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current">
              <Icon size={12} />
            </span>
            <span>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
