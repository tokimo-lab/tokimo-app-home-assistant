/**
 * Per-domain accent gradients inspired by the Apple Home colour palette.
 * Active = saturated gradient, inactive = neutral surface.
 */

interface DomainColors {
  active: string;
  inactive: string;
  text: string;
}

const DOMAIN_COLORS: Record<string, DomainColors> = {
  light: {
    active: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#fef3c7",
  },
  switch: {
    active: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#dbeafe",
  },
  fan: {
    active: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#e0f2fe",
  },
  cover: {
    active: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#e0f2fe",
  },
  climate: {
    active: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#ccfbf1",
  },
  lock: {
    active: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    inactive: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    text: "#fecaca",
  },
  media_player: {
    active: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#ede9fe",
  },
  scene: {
    active: "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#f3e8ff",
  },
  script: {
    active: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#e0e7ff",
  },
  binary_sensor: {
    active: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#ffedd5",
  },
  sensor: {
    active: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#f3f4f6",
  },
  camera: {
    active: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
    inactive: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
    text: "#e5e7eb",
  },
  vacuum: {
    active: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#dcfce7",
  },
  input_boolean: {
    active: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#dbeafe",
  },
  automation: {
    active: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    text: "#fef3c7",
  },
};

const FALLBACK: DomainColors = {
  active: "linear-gradient(135deg, #4b5563 0%, #374151 100%)",
  inactive: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
  text: "#f3f4f6",
};

export function getDomainColors(domain: string): DomainColors {
  return DOMAIN_COLORS[domain] ?? FALLBACK;
}

export function getTileGradient(domain: string, state: string): string {
  const colors = getDomainColors(domain);
  // lock: "locked" = active (red = danger), "unlocked" = inactive-like (green)
  if (domain === "lock") {
    return state === "locked" ? colors.active : colors.inactive;
  }
  const on =
    state === "on" ||
    state === "open" ||
    state === "playing" ||
    state === "cleaning" ||
    state === "active";
  return on ? colors.active : colors.inactive;
}

export function getTileTextColor(domain: string): string {
  return (DOMAIN_COLORS[domain] ?? FALLBACK).text;
}
