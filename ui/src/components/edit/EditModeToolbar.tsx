import { cn } from "@tokimo/ui";

interface EditModeToolbarProps {
  title: string;
  onDone: () => void;
  /** Optional sublabel shown below the title (e.g. "Reorder Sections" mode). */
  subtitle?: string;
  /** When true, the title is muted to hint at a sub-mode (Reorder Sections). */
  muted?: boolean;
  t: (k: string) => string;
}

/**
 * Edit-mode top bar. Replaces the regular HomePage header while editing.
 *
 * Apple Home pattern: home name centered, single "Done" affordance on the
 * right (no Cancel — every mutation is persisted live by useDisplayPatch).
 */
export function EditModeToolbar({
  title,
  subtitle,
  muted = false,
  onDone,
  t,
}: EditModeToolbarProps) {
  return (
    <div
      data-testid="edit-mode-toolbar"
      className="relative flex items-center justify-center"
    >
      <div className="flex flex-col items-center text-center">
        <h1
          className={cn(
            "text-2xl font-semibold",
            muted
              ? "text-[var(--text-secondary)]"
              : "text-[var(--text-primary)]",
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDone}
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2",
          "cursor-pointer rounded-full px-4 py-1.5",
          "text-sm font-semibold text-[var(--accent,#3b82f6)]",
          "transition hover:bg-white/[0.06]",
        )}
      >
        {t("done")}
      </button>
    </div>
  );
}
