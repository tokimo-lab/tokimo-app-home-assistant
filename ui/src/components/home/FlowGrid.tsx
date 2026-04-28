import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
  UpdateEntityDisplayDto,
} from "../../types";
import { resolveTile } from "../tiles";
import { EditableTile } from "./EditableTile";

interface FlowGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
  editMode?: boolean;
  onPatchDisplay?: (
    entityId: string,
    dto: UpdateEntityDisplayDto,
  ) => void | Promise<void>;
  /** When true and editMode is on, renders the favorite +/− button. Default false. */
  enableFavoriteToggle?: boolean;
}

function spanClass(size?: EntitySize): string {
  if (size === "large") return "col-span-2 row-span-2 aspect-square";
  if (size === "medium") return "col-span-2 row-span-1 aspect-[2/1]";
  return "col-span-1 row-span-1 aspect-square";
}

export function FlowGrid({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
  editMode = false,
  onPatchDisplay,
  enableFavoriteToggle = false,
}: FlowGridProps) {
  if (entities.length === 0) return null;
  return (
    <div
      className="grid auto-rows-fr gap-2"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      }}
    >
      {entities.map((entity) => {
        const Tile = resolveTile(entity);
        const tileNode = (
          <Tile
            entity={entity}
            instanceId={instanceId}
            pending={getPending(entity.entity_id)}
            onCall={onCall}
            t={t}
          />
        );
        return (
          <div key={entity.entity_id} className={spanClass(entity.size)}>
            <EditableTile
              entity={entity}
              editMode={editMode}
              onCycleSize={
                onPatchDisplay
                  ? (next) =>
                      void onPatchDisplay(entity.entity_id, { size: next })
                  : undefined
              }
              onToggleFavorite={
                enableFavoriteToggle && onPatchDisplay
                  ? (next) =>
                      void onPatchDisplay(entity.entity_id, {
                        is_favorite: next,
                      })
                  : undefined
              }
              t={t}
            >
              {tileNode}
            </EditableTile>
          </div>
        );
      })}
    </div>
  );
}
