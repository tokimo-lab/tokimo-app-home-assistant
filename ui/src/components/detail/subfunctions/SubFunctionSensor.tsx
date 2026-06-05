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
    <span className="text-[15px] font-medium text-fg-primary tabular-nums text-fg-primary">
      {display}
      {unit && ` ${unit}`}
    </span>
  );
}
