/**
 * Read-only sensor display (numeric / text state with unit).
 */
import { formatNumeric } from "../../../lib/format-number";
import type { EntityState } from "../../../types";

interface SubFunctionSensorProps {
  entity: EntityState;
}

export function SubFunctionSensor({ entity }: SubFunctionSensorProps) {
  const { state, attributes, decimal_places } = entity;
  const unit =
    typeof attributes.unit_of_measurement === "string"
      ? attributes.unit_of_measurement
      : "";

  const formatted = formatNumeric(state, decimal_places, 1);
  const display = formatted ?? state;

  return (
    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
      {display}
      {unit && ` ${unit}`}
    </span>
  );
}
