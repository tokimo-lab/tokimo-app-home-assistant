/**
 * Number/input_number control using a horizontal mini slider.
 */
import { useEffect, useState } from "react";
import type { EntityState } from "../../../types";

interface SubFunctionNumberProps {
  entity: EntityState;
  onSet: (value: number) => void;
}

export function SubFunctionNumber({ entity, onSet }: SubFunctionNumberProps) {
  const { state, attributes } = entity;
  const min =
    typeof attributes.min === "number" ? attributes.min : 0;
  const max =
    typeof attributes.max === "number" ? attributes.max : 100;
  const step =
    typeof attributes.step === "number" ? attributes.step : 1;

  const numericState = Number.parseFloat(state);
  const [value, setValue] = useState(Number.isNaN(numericState) ? min : numericState);

  useEffect(() => {
    const parsed = Number.parseFloat(state);
    if (!Number.isNaN(parsed)) {
      setValue(parsed);
    }
  }, [state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number.parseFloat(e.target.value);
    setValue(newValue);
  };

  const handleCommit = () => {
    if (value !== numericState) {
      onSet(value);
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
        {value.toFixed(step < 1 ? 1 : 0)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        onPointerUp={handleCommit}
        className="h-2 w-24 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
      />
    </div>
  );
}
