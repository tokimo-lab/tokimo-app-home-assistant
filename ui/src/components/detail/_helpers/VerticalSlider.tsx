import { useCallback, useEffect, useRef, useState } from "react";

interface VerticalSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  /** CSS color/gradient for the filled portion. */
  fillClassName: string;
  /** CSS color/gradient for the empty/track portion. */
  trackClassName: string;
  ariaLabel: string;
  /** Optional content rendered centered, overlaid on the slider. */
  children?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Vertical slider operated via Pointer Events. Drag from anywhere on the
 * track and the fill follows. The component is fully controlled — `onChange`
 * fires while dragging, `onChangeEnd` (if provided) fires once on release.
 *
 * Used by LightDetail (brightness) and CoverDetail (position).
 */
export function VerticalSlider({
  value,
  min,
  max,
  onChange,
  onChangeEnd,
  fillClassName,
  trackClassName,
  ariaLabel,
  children,
  disabled = false,
}: VerticalSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastValueRef = useRef(value);

  const valueFromClientY = useCallback(
    (clientY: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const ratio = 1 - (clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, ratio));
      const raw = min + clamped * (max - min);
      return Math.round(raw);
    },
    [value, min, max],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const next = valueFromClientY(e.clientY);
      lastValueRef.current = next;
      onChange(next);
    };
    const handleUp = () => {
      setDragging(false);
      onChangeEnd?.(lastValueRef.current);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragging, valueFromClientY, onChange, onChangeEnd]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const next = valueFromClientY(e.clientY);
    lastValueRef.current = next;
    onChange(next);
    setDragging(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = Math.max(1, Math.round((max - min) / 20));
    let next = value;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft")
      next = value - step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else return;
    e.preventDefault();
    next = Math.max(min, Math.min(max, next));
    onChange(next);
    onChangeEnd?.(next);
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`relative h-72 w-32 cursor-pointer touch-none select-none overflow-hidden rounded-3xl ${trackClassName} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <div
        className={`absolute inset-x-0 bottom-0 ${fillClassName} transition-[height] duration-75 ease-out`}
        style={{ height: `${pct}%` }}
      />
      {children && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
