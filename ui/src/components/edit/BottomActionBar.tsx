/**
 * Floating bottom action bar shown only in edit mode (P8.3.4 / 3.5).
 *
 * Driven entirely by `selectedTileIds.size`:
 *   - 0 → not rendered (returns null so HomePage can mount unconditionally)
 *   - 1 → "Split" button (only when the tile has ≥2 members)
 *   - ≥2 → "Merge" button + selection count
 */
import { cn } from "@tokimo/ui";
import { Combine, Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";

interface BottomActionBarProps {
  /** Whether the single selected tile is splittable (member count ≥ 2). */
  canSplit: boolean;
  onMerge: () => void;
  onSplit: () => void;
  t: (k: string) => string;
}

export function BottomActionBar({
  canSplit,
  onMerge,
  onSplit,
  t,
}: BottomActionBarProps) {
  const { editMode, reorderSections, selectedTileIds } = useEditHomeView();

  if (!editMode || reorderSections) return null;
  const count = selectedTileIds.size;
  if (count === 0) return null;
  if (count === 1 && !canSplit) return null;

  return (
    <div
      data-testid="bottom-action-bar"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/[0.08]",
          "bg-black/70 px-4 py-2 shadow-2xl backdrop-blur-xl",
        )}
      >
        <span className="text-xs font-medium text-white/70">
          {t("bottomBarSelected")
            .replace("{n}", String(count))
            .replace("{plural}", count === 1 ? "" : "s")}
        </span>
        {count === 1 && canSplit && (
          <Action icon={<Scissors size={16} />} onClick={onSplit}>
            {t("bottomBarSplit")}
          </Action>
        )}
        {count >= 2 && (
          <Action icon={<Combine size={16} />} onClick={onMerge}>
            {t("bottomBarMerge")}
          </Action>
        )}
      </div>
    </div>
  );
}

function Action({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold",
        "text-white transition hover:bg-blue-400",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
