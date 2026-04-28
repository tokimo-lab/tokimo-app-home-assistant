import { ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { CallParams, EntityState, PendingOp } from "../../types";
import { TileGrid } from "./TileGrid";

interface CamerasSectionProps {
  cameras: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  t: (k: string) => string;
}

export function CamerasSection({
  cameras,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  t,
}: CamerasSectionProps) {
  if (cameras.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => {
          // TODO(H5+): jump to dedicated cameras grid view.
          console.log("[CamerasSection] open cameras grid");
        }}
        className="mb-3 flex cursor-pointer items-center gap-1 text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
      >
        <span>{t("sectionCameras")}</span>
        <ChevronRight size={18} />
      </button>
      <TileGrid
        entities={cameras}
        instanceId={instanceId}
        getPending={getPending}
        onCall={onCall}
        onContextMenu={onContextMenu}
        forceSize="large"
        t={t}
      />
    </section>
  );
}
