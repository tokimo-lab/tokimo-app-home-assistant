import { cn } from "@tokimo/ui";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getInstanceSummary } from "../../api/summary";
import type { InstanceSummary } from "../../types/summary";

interface HomeSummaryProps {
  instanceId: string;
  variant?: "banner" | "menu";
  onClick?: (summary: InstanceSummary) => void;
  t: (k: string) => string;
}

export function HomeSummary({
  instanceId,
  variant = "banner",
  onClick,
  t,
}: HomeSummaryProps) {
  const [summary, setSummary] = useState<InstanceSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInstanceSummary(instanceId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err) => {
        // Non-fatal; summary is purely informational.
        console.warn("[HomeSummary] failed to load", err);
      });
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  if (!summary || summary.unavailable_entities.length === 0) return null;

  const count = summary.unavailable_entities.length;
  const handle = () => {
    if (onClick) {
      onClick(summary);
    } else {
      // TODO(H5+): jump to unavailable list overlay; for now just log.
      console.log("[HomeSummary] open unavailable list", summary);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl text-left transition",
        variant === "banner"
          ? "bg-amber-500/10 px-4 py-3 hover:bg-amber-500/15"
          : "px-3 py-2 hover:bg-white/[0.06]",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
        <AlertCircle size={16} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-fg-primary">
          {count} {t("summaryAccessories")}
        </span>
        <span className="block text-xs text-fg-secondary">
          {t("summaryNoResponse")}
        </span>
      </span>
      <ChevronRight
        size={16}
        className="shrink-0 text-fg-secondary"
      />
    </button>
  );
}
