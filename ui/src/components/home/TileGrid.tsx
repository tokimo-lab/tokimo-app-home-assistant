import { cn } from "@tokimo/ui";
import type { MouseEvent as ReactMouseEvent } from "react";
import { getDomain } from "../../lib/domain";
import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";
import { resolveTile } from "../tiles";

interface TileGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  /** Force every tile to this size, ignoring per-entity preference. */
  forceSize?: EntitySize;
  /** Edit-mode flag for parent-driven jiggle visuals (H9 will plug in). */
  editMode?: boolean;
  t: (k: string) => string;
}

const SIZE_SPAN: Record<EntitySize, string> = {
  small: "col-span-1 row-span-1 aspect-square",
  medium: "col-span-2 row-span-1 aspect-[2/1]",
  large: "col-span-2 row-span-2 aspect-square",
};

const MEDIUM_DEFAULT = new Set(["climate", "media_player"]);

function defaultSizeFor(entity: EntityState): EntitySize {
  const d = getDomain(entity.entity_id);
  if (d === "camera") return "large";
  if (MEDIUM_DEFAULT.has(d)) return "medium";
  if (d === "sensor") {
    const dc = entity.attributes?.device_class;
    if (dc === "temperature" || dc === "humidity") return "medium";
    return "small";
  }
  if (d === "cover") {
    return typeof entity.attributes?.current_position === "number"
      ? "medium"
      : "small";
  }
  return "small";
}

export function TileGrid({
  entities,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  forceSize,
  editMode,
  t,
}: TileGridProps) {
  if (entities.length === 0) return null;
  return (
    <div
      data-edit-mode={editMode ? "true" : undefined}
      className={cn(
        "grid grid-cols-4 gap-2",
        "sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8",
      )}
    >
      {entities.map((entity) => {
        const Tile = resolveTile(entity);
        const size = forceSize ?? entity.size ?? defaultSizeFor(entity);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu is a passive enhancement; the tile inside owns its own interactive role
          <div
            key={entity.entity_id}
            className={SIZE_SPAN[size]}
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
            />
          </div>
        );
      })}
    </div>
  );
}
