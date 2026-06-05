import { Power } from "lucide-react";
import type { DomainDetailProps } from "./_types";

export function SwitchDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state } = entity;
  const isOn = state === "on";
  const domain = entity_id.split(".")[0] ?? "switch";

  const toggle = () => {
    onCall({
      entity_id,
      domain,
      service: isOn ? "turn_off" : "turn_on",
      target: { entity_id },
      optimisticState: isOn ? "off" : "on",
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isOn}
        aria-label={isOn ? t("detailSwitchTurnOff") : t("detailSwitchTurnOn")}
        className={`flex h-40 w-40 cursor-pointer items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
          isOn
            ? "bg-amber-400 text-white hover:bg-amber-500"
            : "bg-surface-raised text-fg-secondary hover:bg-surface-raised"
        }`}
      >
        <Power size={64} strokeWidth={1.5} />
      </button>
      <p className="font-medium text-base text-fg-primary">
        {isOn ? t("stateOn") : t("stateOff")}
      </p>
    </div>
  );
}
