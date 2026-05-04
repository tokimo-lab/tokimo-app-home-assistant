import { Settings } from "lucide-react";
import { type ComponentType, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatState, getFriendlyName } from "../../lib/format";
import { useAccessoryMemberIds } from "../../state/useAccessories";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { useEntity } from "../../state/useEntity";
import type { CallParams, PendingOp } from "../../types";
import type { DomainDetailProps } from "./_types";
import { BinarySensorDetail } from "./BinarySensorDetail";
import { CameraDetail } from "./CameraDetail";
import { ClimateDetail } from "./ClimateDetail";
import { CoverDetail } from "./CoverDetail";
import { FanDetail } from "./FanDetail";
import { LightDetail } from "./LightDetail";
import { LockDetail } from "./LockDetail";
import { MediaPlayerDetail } from "./MediaPlayerDetail";
import { SceneDetail } from "./SceneDetail";
import { ScriptDetail } from "./ScriptDetail";
import { SensorDetail } from "./SensorDetail";
import { SubFunctionList } from "./SubFunctionList";
import { SwitchDetail } from "./SwitchDetail";
import { UnsupportedDetail } from "./UnsupportedDetail";
import { VacuumDetail } from "./VacuumDetail";

interface DetailOverlayProps {
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
  media_player: MediaPlayerDetail,
  scene: SceneDetail,
  script: ScriptDetail,
  fan: FanDetail,
  sensor: SensorDetail,
  binary_sensor: BinarySensorDetail,
  vacuum: VacuumDetail,
  camera: CameraDetail,
};

export function DetailOverlay({
  onCall,
  getPending,
  onOpenSettings,
  t,
}: DetailOverlayProps) {
  const { currentEntity, closeDetail, openDetail } = useDetailOverlay();
  const entityId = currentEntity?.entityId ?? "";

  // P11: subscribe only to this entity's live state; sibling sub-members
  // re-subscribe themselves inside SubFunctionRow.
  const entity = useEntity(entityId);
  // Id-only accessory view — does not subscribe to the live store.
  const accessory = useAccessoryMemberIds(entityId);

  useEffect(() => {
    if (!currentEntity) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentEntity, closeDetail]);

  if (!currentEntity) return null;

  const domain = currentEntity.entityId.split(".")[0] ?? "";
  const DomainComponent = DOMAIN_DETAILS[domain] ?? UnsupportedDetail;
  const pending = getPending(currentEntity.entityId);
  const name = entity ? getFriendlyName(entity) : currentEntity.entityId;
  const subtitle = entity ? formatState(entity, t) : "";

  // Only show sub-functions when the currently focused entity is the
  // accessory's primary (siblings opened directly shouldn't surface peers).
  const showSubFunctions =
    accessory != null &&
    accessory.primaryEntityId === currentEntity.entityId &&
    accessory.subMemberIds.length > 0;

  const handleNavigateToSubFunction = (id: string) => {
    openDetail(id, currentEntity.instanceId);
  };

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

        <div className="flex-1 overflow-y-auto px-6 py-4 pb-20">
          {entity ? (
            <>
              <DomainComponent
                entity={entity}
                onCall={onCall}
                pending={pending}
                t={t}
              />
              {showSubFunctions && accessory && (
                <SubFunctionList
                  subMembers={accessory.subMemberIds}
                  onCall={onCall}
                  onNavigate={handleNavigateToSubFunction}
                  t={t}
                />
              )}
            </>
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t("detailEntityMissing")}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenSettings(currentEntity.entityId)}
          className="absolute right-4 bottom-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 shadow-md transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          aria-label={t("detailOpenSettings")}
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
