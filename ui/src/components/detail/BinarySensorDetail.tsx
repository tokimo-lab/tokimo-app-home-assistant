import { Circle, CircleDot } from "lucide-react";
import type { DomainDetailProps } from "./_types";

function formatRelative(iso: string, t: (k: string) => string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("detailBinarySensorJustNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function labelFor(
  deviceClass: string,
  isOn: boolean,
  t: (k: string) => string,
): string {
  // Pairs follow Home Assistant binary_sensor device_class semantics.
  const pairs: Record<string, [string, string]> = {
    door: ["stateOpen", "stateClosed"],
    window: ["stateOpen", "stateClosed"],
    garage_door: ["stateOpen", "stateClosed"],
    opening: ["stateOpen", "stateClosed"],
    lock: ["stateUnlocked", "stateLocked"],
    motion: ["stateMotionDetected", "stateClear"],
    occupancy: ["stateOccupied", "stateClear"],
    presence: ["stateHome", "stateAway"],
    moisture: ["stateWet", "stateDry"],
    smoke: ["stateDetected", "stateClear"],
    gas: ["stateDetected", "stateClear"],
    co: ["stateDetected", "stateClear"],
    problem: ["stateProblem", "stateOk"],
    safety: ["stateUnsafe", "stateSafe"],
    connectivity: ["stateConnected", "stateDisconnected"],
    battery: ["stateLow", "stateNormal"],
    plug: ["statePluggedIn", "stateUnplugged"],
    power: ["stateOn", "stateOff"],
  };
  const pair = pairs[deviceClass];
  if (pair) return t(isOn ? pair[0] : pair[1]);
  return isOn ? t("stateOn") : t("stateOff");
}

export function BinarySensorDetail({ entity, t }: DomainDetailProps) {
  const { state, attributes, last_changed } = entity;
  const deviceClass =
    typeof attributes.device_class === "string" ? attributes.device_class : "";
  const isOn = state === "on";
  const isUnknown = state === "unknown" || state === "unavailable";

  const label = isUnknown
    ? t(`state${state.charAt(0).toUpperCase()}${state.slice(1)}`) || state
    : labelFor(deviceClass, isOn, t);

  const changed = last_changed ? formatRelative(last_changed, t) : "";

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full transition ${
          isOn
            ? "bg-amber-100 text-amber-500 dark:bg-amber-500/20 dark:text-amber-300"
            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
        }`}
      >
        {isOn ? <CircleDot size={56} /> : <Circle size={56} />}
      </div>
      <p className="font-semibold text-3xl text-zinc-900 dark:text-zinc-100">
        {label}
      </p>
      {deviceClass && (
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
          {deviceClass}
        </p>
      )}
      {changed && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("detailBinarySensorLastChanged")}: {changed}
        </p>
      )}
    </div>
  );
}
