/**
 * Toggle switch control for switch/light/input_boolean/fan entities.
 */
import type { EntityState } from "../../../types";

interface SubFunctionToggleProps {
  entity: EntityState;
  onToggle: () => void;
}

export function SubFunctionToggle({
  entity,
  onToggle,
}: SubFunctionToggleProps) {
  const isOn = entity.state === "on";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative h-8 w-14 cursor-pointer rounded-full transition-colors ${
        isOn ? "bg-blue-500 dark:bg-blue-600" : "bg-surface-raised"
      }`}
      aria-pressed={isOn}
      aria-label={isOn ? "Turn Off" : "Turn On"}
    >
      <span
        className={`absolute top-1 left-0 h-6 w-6 rounded-full bg-surface-base shadow-md transition-transform ${
          isOn ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}
