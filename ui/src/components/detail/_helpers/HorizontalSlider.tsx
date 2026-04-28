import { useCallback, useEffect, useRef, useState } from "react";

interface HorizontalSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  fillClassName: string;
  trackClassName: string;
  ariaLabel: string;
  disabled?: boolean;
  /** Optional content rendered centered on top of the track. */
  children?: React.ReactNode;
  /** Tailwind height utility, defaults to h-3. */
  heightClassName?: string;
}

/**
 * Horizontal slider operated via Pointer Events. Mirror of VerticalSlider
 * for horizontal use cases (media player volume, etc.).
 */
export function HorizontalSlider({
  value,
  min,
  max,
  onChange,
  onChangeEnd,
  fillClassName,
  trackClassName,
  ariaLabel,
  disabled = false,
  children,
  heightClassName = "h-3",
}: HorizontalSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastValueRef = useRef(value);

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, ratio));
      const raw = min + clamped * (max - min);
      return Math.round(raw);
    },
    [value, min, max],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const next = valueFromClientX(e.clientX);
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
  }, [dragging, valueFromClientX, onChange, onChangeEnd]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const next = valueFromClientX(e.clientX);
    lastValueRef.current = next;
    onChange(next);
    setDragging(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = Math.max(1, Math.round((max - min) / 20));
    let next = value;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
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
      className={`relative w-full ${heightClassName} cursor-pointer touch-none select-none overflow-hidden rounded-full ${trackClassName} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 ${fillClassName} transition-[width] duration-75 ease-out`}
        style={{ width: `${pct}%` }}
      />
      {children && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
