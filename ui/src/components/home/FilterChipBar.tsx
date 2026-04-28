import { cn } from "@tokimo/ui";
import {
  Blinds,
  Lightbulb,
  Power,
  Shield,
  Speaker,
  Thermometer,
  Wind,
} from "lucide-react";
import type { FC } from "react";
import { getDomain } from "../../lib/domain";
import {
  CHIP_ORDER,
  type ChipId,
  domainsForChip,
} from "../../state/useFilterChip";
import type { EntityState } from "../../types";

interface FilterChipBarProps {
  availableChips: ChipId[];
  selectedChip: ChipId | null;
  onSelectChip: (chip: ChipId) => void;
  entities: ReadonlyMap<string, EntityState>;
  t: (k: string) => string;
}

interface ChipMeta {
  icon: FC<{ size?: number; className?: string }>;
  labelKey: string;
}

const CHIP_META: Record<ChipId, ChipMeta> = {
  climate: { icon: Thermometer, labelKey: "ha.chip.climate" },
  lights: { icon: Lightbulb, labelKey: "ha.chip.lights" },
  security: { icon: Shield, labelKey: "ha.chip.security" },
  speakers_tvs: { icon: Speaker, labelKey: "ha.chip.speakersTvs" },
  covers: { icon: Blinds, labelKey: "ha.chip.covers" },
  switches: { icon: Power, labelKey: "ha.chip.switches" },
  fans: { icon: Wind, labelKey: "ha.chip.fans" },
};

const ENV_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

function entitiesForChip(
  chip: ChipId,
  entities: ReadonlyMap<string, EntityState>,
): EntityState[] {
  const domains = new Set(domainsForChip(chip));
  const out: EntityState[] = [];
  for (const e of entities.values()) {
    const d = getDomain(e.entity_id);
    if (!domains.has(d)) continue;
    if (chip === "climate" && d === "sensor") {
      const dc = e.attributes?.device_class;
      if (typeof dc !== "string" || !ENV_SENSOR_CLASSES.has(dc)) continue;
    }
    out.push(e);
  }
  return out;
}

function chipSummary(
  chip: ChipId,
  entities: ReadonlyMap<string, EntityState>,
  t: (k: string) => string,
): string | null {
  const list = entitiesForChip(chip, entities);
  if (list.length === 0) return null;

  if (chip === "lights") {
    const on = list.filter((e) => e.state === "on").length;
    return on > 0
      ? `${on} ${t("ha.chip.summary.on")}`
      : t("ha.chip.summary.allOff");
  }

  if (chip === "switches" || chip === "fans") {
    const on = list.filter((e) => e.state === "on").length;
    return on > 0
      ? `${on} ${t("ha.chip.summary.on")}`
      : t("ha.chip.summary.allOff");
  }

  if (chip === "climate") {
    const temps: number[] = [];
    for (const e of list) {
      if (getDomain(e.entity_id) === "sensor") {
        const v = Number.parseFloat(e.state);
        if (!Number.isNaN(v) && e.attributes?.device_class === "temperature") {
          temps.push(v);
        }
      } else {
        const cur = e.attributes?.current_temperature;
        if (typeof cur === "number") temps.push(cur);
      }
    }
    if (temps.length === 0) return null;
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    if (Math.abs(max - min) < 0.1) return `${min.toFixed(1)}°`;
    return `${min.toFixed(1)}–${max.toFixed(1)}°`;
  }

  if (chip === "security") {
    const unlocked = list.filter(
      (e) => getDomain(e.entity_id) === "lock" && e.state === "unlocked",
    ).length;
    if (unlocked > 0) {
      return `${unlocked} ${t("ha.chip.summary.unlocked")}`;
    }
    return t("ha.chip.summary.secure");
  }

  if (chip === "speakers_tvs") {
    const playing = list.filter((e) => e.state === "playing").length;
    return playing > 0
      ? `${playing} ${t("ha.chip.summary.playing")}`
      : t("ha.chip.summary.idle");
  }

  if (chip === "covers") {
    const open = list.filter(
      (e) => e.state === "open" || e.state === "opening",
    ).length;
    return open > 0
      ? `${open} ${t("ha.chip.summary.open")}`
      : t("ha.chip.summary.closed");
  }

  return null;
}

export function FilterChipBar({
  availableChips,
  selectedChip,
  onSelectChip,
  entities,
  t,
}: FilterChipBarProps) {
  if (availableChips.length === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {(CHIP_ORDER as readonly ChipId[])
        .filter((c) => availableChips.includes(c))
        .map((chip) => {
          const meta = CHIP_META[chip];
          const Icon = meta.icon;
          const active = selectedChip === chip;
          const summary = chipSummary(chip, entities, t);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => onSelectChip(chip)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
                active
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-white dark:text-neutral-900"
                  : "bg-white/[0.06] text-[var(--text-primary)] hover:bg-white/[0.1] dark:bg-white/[0.06]",
              )}
              aria-pressed={active}
            >
              <Icon
                size={14}
                className={active ? "text-neutral-900" : "text-current"}
              />
              <span className="font-medium">{t(meta.labelKey)}</span>
              {summary && (
                <span
                  className={cn(
                    "text-xs",
                    active
                      ? "text-neutral-500"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  {summary}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}
