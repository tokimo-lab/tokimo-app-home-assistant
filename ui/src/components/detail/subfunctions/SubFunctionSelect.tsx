/**
 * Select/input_select control using native select dropdown.
 */
import type { EntityState } from "../../../types";

interface SubFunctionSelectProps {
  entity: EntityState;
  onSelect: (option: string) => void;
}

export function SubFunctionSelect({
  entity,
  onSelect,
}: SubFunctionSelectProps) {
  const { state, attributes } = entity;
  const options = Array.isArray(attributes.options)
    ? (attributes.options as string[])
    : [];

  if (options.length === 0) {
    return (
      <span className="text-sm text-zinc-500 dark:text-zinc-500">{state}</span>
    );
  }

  return (
    <select
      value={state}
      onChange={(e) => onSelect(e.target.value)}
      className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm transition hover:border-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500"
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
