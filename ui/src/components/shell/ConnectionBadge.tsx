import { Wifi, WifiOff } from "lucide-react";
import type { ConnStatus } from "../../types";

interface ConnectionBadgeProps {
  status: ConnStatus;
  t: (k: string) => string;
}

type StatusKey = "connected" | "disconnected" | "connecting" | "error";

const STATUS_CONFIG: Record<
  StatusKey,
  { color: string; dotColor: string; label: string }
> = {
  connected: {
    color: "text-green-400",
    dotColor: "bg-green-400",
    label: "connConnected",
  },
  disconnected: {
    color: "text-[var(--text-muted,#6b7280)]",
    dotColor: "bg-gray-500",
    label: "connDisconnected",
  },
  connecting: {
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
    label: "connConnecting",
  },
  error: {
    color: "text-red-400",
    dotColor: "bg-red-400",
    label: "connError",
  },
};

function statusKey(status: ConnStatus): StatusKey {
  if (typeof status === "string") return status;
  return "error";
}

export function ConnectionBadge({ status, t }: ConnectionBadgeProps) {
  const key = statusKey(status);
  const cfg = STATUS_CONFIG[key];

  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-xs ${cfg.color}`}>
      <span
        className={`h-2 w-2 rounded-full ${cfg.dotColor} ${key === "connecting" ? "animate-pulse" : ""}`}
      />
      <span>{t(cfg.label)}</span>
      {key === "connected" ? (
        <Wifi size={12} />
      ) : (
        <WifiOff size={12} className="opacity-50" />
      )}
    </div>
  );
}
