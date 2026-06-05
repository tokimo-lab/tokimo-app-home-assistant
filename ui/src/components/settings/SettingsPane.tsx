import { X } from "lucide-react";
import type { HaInstance } from "../../types";
import { FamilyTab } from "./FamilyTab";

/**
 * Per plan v3 §2: the legacy three-tab Settings (Family / Rooms / Favorites)
 * is collapsed to a single "Family" view. Room CRUD moved to HomeSettingsPage,
 * and Favorites is a tile-level toggle (no dedicated tab).
 *
 * `SettingsTab` is kept as a single-value type alias so callers that still
 * thread it through don't need to change shape; new callers can omit it.
 */
export type SettingsTab = "family";

interface SettingsPaneProps {
  instance: HaInstance | null;
  onClose: () => void;
  onInstanceUpdated?: () => void;
  onInstanceDeleted: () => void;
  t: (k: string) => string;
}

export function SettingsPane({
  instance,
  onClose,
  onInstanceUpdated,
  onInstanceDeleted,
  t,
}: SettingsPaneProps) {
  return (
    <div className="flex h-full flex-col bg-surface-base">
      <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
        <h2 className="text-sm font-semibold text-white">
          {t("settingsTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("settingsClose")}
          title={t("settingsClose")}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {instance === null ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/60">{t("noInstances")}</p>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.08] hover:text-white"
            >
              {t("settingsClose")}
            </button>
          </div>
        ) : (
          <FamilyTab
            instance={instance}
            onUpdated={onInstanceUpdated}
            onDeleted={onInstanceDeleted}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
