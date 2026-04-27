import { Lightbulb, Power, Speaker, Thermometer } from "lucide-react";
import { getDomain } from "../../lib/domain";
import type { EntityState } from "../../types";

interface StatusBadgesRowProps {
  entities: EntityState[];
  t: (k: string) => string;
}

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

interface Badge {
  key: string;
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
}

function computeBadges(
  entities: EntityState[],
  t: (k: string) => string,
): Badge[] {
  const badges: Badge[] = [];

  const climateTemps: number[] = [];
  let lightsOn = 0;
  let switchesOn = 0;
  let mediaPlaying = 0;

  for (const e of entities) {
    if (e.hidden) continue;
    const domain = getDomain(e.entity_id);
    if (domain === "climate") {
      const temp = e.attributes.current_temperature;
      if (typeof temp === "number") climateTemps.push(temp);
    } else if (domain === "light" && e.state === "on") {
      lightsOn += 1;
    } else if (
      (domain === "switch" || domain === "input_boolean" || domain === "fan") &&
      e.state === "on"
    ) {
      switchesOn += 1;
    } else if (domain === "media_player" && e.state === "playing") {
      mediaPlaying += 1;
    }
  }

  if (climateTemps.length > 0) {
    const min = Math.min(...climateTemps);
    const max = Math.max(...climateTemps);
    badges.push({
      key: "climate",
      icon: Thermometer,
      label: interpolate(t("aggClimateRange"), {
        min: min.toFixed(1),
        max: max.toFixed(1),
      }),
    });
  }
  if (lightsOn > 0) {
    badges.push({
      key: "light",
      icon: Lightbulb,
      label: interpolate(t("aggLightsOn"), { count: lightsOn }),
    });
  }
  if (switchesOn > 0) {
    badges.push({
      key: "switch",
      icon: Power,
      label: interpolate(t("aggSwitchesOn"), { count: switchesOn }),
    });
  }
  if (mediaPlaying > 0) {
    badges.push({
      key: "media",
      icon: Speaker,
      label: interpolate(t("aggMediaPlaying"), { count: mediaPlaying }),
    });
  }

  return badges;
}

export function StatusBadgesRow({ entities, t }: StatusBadgesRowProps) {
  const badges = computeBadges(entities, t);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {badges.map(({ key, icon: Icon, label }) => (
        <div
          key={key}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
        >
          <Icon size={14} className="text-[var(--text-secondary)]" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
