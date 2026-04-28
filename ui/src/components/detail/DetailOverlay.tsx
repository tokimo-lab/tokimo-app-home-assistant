import { Settings } from "lucide-react";
import { type ComponentType, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatState, getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import type { CallParams, EntityState, PendingOp } from "../../types";
import type { DomainDetailProps } from "./_types";
import { ClimateDetail } from "./ClimateDetail";
import { CoverDetail } from "./CoverDetail";
import { LightDetail } from "./LightDetail";
import { LockDetail } from "./LockDetail";
import { SwitchDetail } from "./SwitchDetail";
import { UnsupportedDetail } from "./UnsupportedDetail";

interface DetailOverlayProps {
  getEntity: (entityId: string) => EntityState | undefined;
  onCall: (params: CallParams) => void;
  getPending: (entityId: string) => PendingOp | undefined;
  onOpenSettings: (entityId: string) => void;
  t: (k: string) => string;
}

/**
 * Domain dispatch table. Adding a new domain detail (H7 scope: media_player,
 * scene, script, fan, sensor, binary_sensor, vacuum, camera) means adding
 * one entry here pointing at the new component. Any unknown domain falls
 * back to UnsupportedDetail.
 */
const DOMAIN_DETAILS: Record<string, ComponentType<DomainDetailProps>> = {
  light: LightDetail,
  climate: ClimateDetail,
  cover: CoverDetail,
  switch: SwitchDetail,
  input_boolean: SwitchDetail,
  lock: LockDetail,
};

export function DetailOverlay({
  getEntity,
  onCall,
  getPending,
  onOpenSettings,
  t,
}: DetailOverlayProps) {
  const { currentEntity, closeDetail } = useDetailOverlay();

  useEffect(() => {
    if (!currentEntity) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentEntity, closeDetail]);

  if (!currentEntity) return null;

  const entity = getEntity(currentEntity.entityId);
  const domain = currentEntity.entityId.split(".")[0] ?? "";
  const DomainComponent = DOMAIN_DETAILS[domain] ?? UnsupportedDetail;
  const pending = getPending(currentEntity.entityId);
  const name = entity ? getFriendlyName(entity) : currentEntity.entityId;
  const subtitle = entity ? formatState(entity, t) : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 backdrop-blur-xl motion-safe:animate-[detail-fade_180ms_ease-out] sm:items-center"
      onPointerDown={closeDetail}
    >
      <div
        className="relative mx-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl motion-safe:animate-[detail-slide_220ms_cubic-bezier(0.22,1,0.36,1)] sm:rounded-3xl dark:bg-zinc-900"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <header className="flex flex-col items-center gap-1 px-6 pt-6 pb-2 text-center">
          <h2 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
            {name}
          </h2>
          {subtitle && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {entity ? (
            <DomainComponent
              entity={entity}
              onCall={onCall}
              pending={pending}
              t={t}
            />
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t("ha.detail.entityMissing")}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenSettings(currentEntity.entityId)}
          className="absolute right-4 bottom-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 shadow-md transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          aria-label={t("ha.detail.openSettings")}
        >
          <Settings size={18} />
        </button>
      </div>

      <style>{`
        @keyframes detail-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes detail-slide {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
