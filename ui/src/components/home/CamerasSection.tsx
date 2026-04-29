import { ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { CallParams, EntityState, PendingOp } from "../../types";
import { resolveTile } from "../tiles";

interface CamerasSectionProps {
  cameras: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  t: (k: string) => string;
}

/**
 * Apple-Home cameras strip: horizontal scroll of fixed-width camera cards
 * so multiple cameras don't dominate the viewport. Each card keeps the
 * camera tile's native large-size visual (square aspect).
 */
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
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cameras.map((entity) => {
          const Tile = resolveTile(entity);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu is a passive enhancement
            <div
              key={entity.entity_id}
              className="aspect-square w-[280px] shrink-0"
              onContextMenu={
                onContextMenu
                  ? (e) => {
                      e.preventDefault();
                      onContextMenu(entity, e);
                    }
                  : undefined
              }
            >
              <Tile
                entity={entity}
                instanceId={instanceId}
                pending={getPending(entity.entity_id)}
                onCall={onCall}
                t={t}
                size="large"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
