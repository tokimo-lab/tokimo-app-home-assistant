import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumeric } from "../../lib/format-number";
import type { DomainDetailProps } from "./_types";

const ARC_DEG = 280;
const ARC_START_DEG = -ARC_DEG / 2;
const RADIUS = 110;
const STROKE = 16;
const SIZE = (RADIUS + STROKE) * 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = (CIRCUMFERENCE * ARC_DEG) / 360;
const GAP_LENGTH = CIRCUMFERENCE - ARC_LENGTH;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map pointer coordinates (relative to SVG center) to a temperature value.
 * Top of the dial = 12 o'clock, arc spans ±140° around the top.
 */
function pointerToTemp(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  minTemp: number,
  maxTemp: number,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  // atan2 returns angle from +x axis; rotate so 0° = top, +ve = clockwise.
  let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
  // deg is now in [-180, 180] with 0 = top, +ve clockwise.
  if (deg < ARC_START_DEG) deg = ARC_START_DEG;
  if (deg > -ARC_START_DEG) deg = -ARC_START_DEG;
  const ratio = (deg - ARC_START_DEG) / ARC_DEG;
  const raw = minTemp + ratio * (maxTemp - minTemp);
  return Math.round(raw * 2) / 2;
}

export function ClimateDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state, attributes } = entity;
  const minTemp = attributes.min_temp ?? 7;
  const maxTemp = attributes.max_temp ?? 35;
  const unit = attributes.unit_of_measurement ?? "°";
  const externalTarget =
    typeof attributes.temperature === "number"
      ? attributes.temperature
      : (minTemp + maxTemp) / 2;
  const current = attributes.current_temperature;
  const hvacModes = attributes.hvac_modes ?? [];

  const [target, setTarget] = useState(externalTarget);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastTargetRef = useRef(externalTarget);

  useEffect(() => {
    setTarget(externalTarget);
    lastTargetRef.current = externalTarget;
  }, [externalTarget]);

  const commit = useCallback(
    (value: number) => {
      onCall({
        entity_id,
        domain: "climate",
        service: "set_temperature",
        target: { entity_id },
        data: { temperature: value },
        optimisticAttributes: { temperature: value },
      });
    },
    [onCall, entity_id],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const el = svgRef.current;
      if (!el) return;
      const next = pointerToTemp(
        e.clientX,
        e.clientY,
        el.getBoundingClientRect(),
        minTemp,
        maxTemp,
      );
      lastTargetRef.current = next;
      setTarget(next);
    };
    const up = () => {
      setDragging(false);
      commit(lastTargetRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, minTemp, maxTemp, commit]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    e.preventDefault();
    const next = pointerToTemp(
      e.clientX,
      e.clientY,
      el.getBoundingClientRect(),
      minTemp,
      maxTemp,
    );
    lastTargetRef.current = next;
    setTarget(next);
    setDragging(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = target;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = target + 0.5;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft")
      next = target - 0.5;
    else return;
    e.preventDefault();
    next = clamp(next, minTemp, maxTemp);
    setTarget(next);
    lastTargetRef.current = next;
    commit(next);
  };

  const ratio = (target - minTemp) / (maxTemp - minTemp);
  const dashOffset = (1 - ratio) * ARC_LENGTH;
  // Position thumb on the arc.
  const thumbDeg = ARC_START_DEG + ratio * ARC_DEG;
  const thumbRad = (thumbDeg - 90) * (Math.PI / 180);
  const thumbX = SIZE / 2 + RADIUS * Math.cos(thumbRad);
  const thumbY = SIZE / 2 + RADIUS * Math.sin(thumbRad);

  const setMode = (mode: string) => {
    onCall({
      entity_id,
      domain: "climate",
      service: "set_hvac_mode",
      target: { entity_id },
      data: { hvac_mode: mode },
      optimisticState: mode,
    });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("detailClimateTarget")}
        aria-valuemin={minTemp}
        aria-valuemax={maxTemp}
        aria-valuenow={target}
        onKeyDown={onKeyDown}
        className="cursor-pointer touch-none select-none outline-none"
      >
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onPointerDown={onPointerDown}
          aria-hidden="true"
        >
          <title>{t("detailClimateTarget")}</title>
          <g
            transform={`rotate(${ARC_START_DEG - 90} ${SIZE / 2} ${SIZE / 2})`}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
              className="text-zinc-200 dark:text-zinc-800"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
              className="text-orange-400 transition-[stroke-dashoffset] duration-75 ease-out"
            />
          </g>
          <circle
            cx={thumbX}
            cy={thumbY}
            r={STROKE / 2 + 2}
            fill="white"
            stroke="currentColor"
            strokeWidth={2}
            className="text-orange-500 drop-shadow"
          />
          <text
            x={SIZE / 2}
            y={SIZE / 2 - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-zinc-900 font-semibold text-5xl dark:fill-zinc-100"
          >
            {target}
            {unit}
          </text>
          {current != null && (
            <text
              x={SIZE / 2}
              y={SIZE / 2 + 28}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-zinc-500 text-sm dark:fill-zinc-400"
            >
              {t("detailClimateCurrent")}:{" "}
              {formatNumeric(current, entity.decimal_places, 1) ?? current}
              {unit}
            </text>
          )}
        </svg>
      </div>

      {hvacModes.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("detailClimateMode")}
          </span>
          <div className="flex flex-wrap gap-2">
            {hvacModes.map((mode) => {
              const active = mode === state;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMode(mode)}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {(() => {
                    const key = `detailClimateHvac${mode.charAt(0).toUpperCase()}${mode.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
                    const v = t(key);
                    return v === key ? mode : v;
                  })()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
