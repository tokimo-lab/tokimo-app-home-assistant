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
import { type FC, useCallback, useEffect, useRef, useState } from "react";
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
  climate: { icon: Thermometer, labelKey: "chipClimate" },
  lights: { icon: Lightbulb, labelKey: "chipLights" },
  security: { icon: Shield, labelKey: "chipSecurity" },
  speakers_tvs: { icon: Speaker, labelKey: "chipSpeakersTvs" },
  covers: { icon: Blinds, labelKey: "chipCovers" },
  switches: { icon: Power, labelKey: "chipSwitches" },
  fans: { icon: Wind, labelKey: "chipFans" },
};

const ENV_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

function entitiesForChip(
  chip: ChipId,
  entities: ReadonlyMap<string, EntityState>,
): EntityState[] {
  const domains = new Set(domainsForChip(chip));
  const out: EntityState[] = [];
  for (const e of entities.values()) {
    if (e.hidden) continue;
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
    return on > 0 ? `${on} ${t("chipSummaryOn")}` : t("chipSummaryAllOff");
  }

  if (chip === "switches" || chip === "fans") {
    const on = list.filter((e) => e.state === "on").length;
    return on > 0 ? `${on} ${t("chipSummaryOn")}` : t("chipSummaryAllOff");
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
      return `${unlocked} ${t("chipSummaryUnlocked")}`;
    }
    return t("chipSummarySecure");
  }

  if (chip === "speakers_tvs") {
    const playing = list.filter((e) => e.state === "playing").length;
    return playing > 0
      ? `${playing} ${t("chipSummaryPlaying")}`
      : t("chipSummaryIdle");
  }

  if (chip === "covers") {
    const open = list.filter(
      (e) => e.state === "open" || e.state === "opening",
    ).length;
    return open > 0
      ? `${open} ${t("chipSummaryOpen")}`
      : t("chipSummaryClosed");
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    left: false,
    right: false,
  });

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 1;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScrollState((prev) =>
      prev.left === canLeft && prev.right === canRight
        ? prev
        : { left: canLeft, right: canRight },
    );
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateScrollState();
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check when chip set changes
  useEffect(() => {
    updateScrollState();
  }, [availableChips, updateScrollState]);

  if (availableChips.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <div
        ref={containerRef}
        className={cn(
          "flex items-center gap-2 overflow-x-auto pb-1",
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
                  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm transition",
                  active
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-white dark:text-neutral-900"
                    : "bg-white/[0.06] text-[var(--text-primary)] hover:bg-white/[0.1] dark:bg-white/[0.06]",
                )}
                aria-pressed={active}
              >
                <Icon
                  size={15}
                  className={active ? "text-neutral-900" : "text-current"}
                />
                <span className="font-medium leading-none">
                  {t(meta.labelKey)}
                </span>
                {summary && (
                  <span
                    className={cn(
                      "text-xs leading-none",
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
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--surface-base,#0b0f17)] to-transparent transition-opacity duration-150",
          scrollState.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--surface-base,#0b0f17)] to-transparent transition-opacity duration-150",
          scrollState.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
