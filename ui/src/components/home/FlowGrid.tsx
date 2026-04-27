import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";
import { resolveTile } from "../tiles";

interface FlowGridProps {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
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
        return (
          <div key={entity.entity_id} className={spanClass(entity.size)}>
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
