import { EmptyState } from "../components/EmptyState";
import { resolveTile } from "../components/tiles";
import { getDomain } from "../lib/domain";
import type { CallParams, EntityState, HaRoom, PendingOp } from "../types";

interface HomePageProps {
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

/** Domains we render tiles for (skip weather/sun/zone etc.) */
const RENDERABLE_DOMAINS = new Set([
  "light",
  "switch",
  "cover",
  "climate",
  "fan",
  "lock",
  "media_player",
  "scene",
  "script",
  "binary_sensor",
  "sensor",
  "camera",
  "vacuum",
  "input_boolean",
  "automation",
]);

function isRenderable(entity: EntityState): boolean {
  return (
    RENDERABLE_DOMAINS.has(getDomain(entity.entity_id)) &&
    entity.state !== "unavailable" &&
    !(entity.override?.hidden ?? false)
  );
}

function TileGrid({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
}: {
  entities: EntityState[];
  instanceId: string;
  getPending: (id: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}) {
  if (entities.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {entities.map((entity) => {
        const Tile = resolveTile(entity);
        return (
          <Tile
            key={entity.entity_id}
            entity={entity}
            instanceId={instanceId}
            pending={getPending(entity.entity_id)}
            onCall={onCall}
            t={t}
          />
        );
      })}
    </div>
  );
}

export function HomePage({
  entities,
  rooms,
  instanceId,
  getPending,
  onCall,
  t,
}: HomePageProps) {
  const allEntities = Array.from(entities.values()).filter(isRenderable);

  if (allEntities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t("homeEmpty")} />
      </div>
    );
  }

  // If no rooms defined, show flat grid
  if (rooms.length === 0) {
    return (
      <div className="overflow-auto p-5">
        <TileGrid
          entities={allEntities}
          instanceId={instanceId}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      </div>
    );
  }

  // Show per-room sections
  // Build set of entity_ids that appear in rooms
  const roomEntityIds = new Set(
    rooms.flatMap((r) => r.entities.map((e) => e.entity_id)),
  );

  // "Other" entities not assigned to any room
  const unassigned = allEntities.filter((e) => !roomEntityIds.has(e.entity_id));

  return (
    <div className="overflow-auto p-5">
      <div className="flex flex-col gap-6">
        {rooms.map((room) => {
          const roomEntities = room.entities
            .map((re) => entities.get(re.entity_id))
            .filter((e): e is EntityState => e != null && isRenderable(e));

          if (roomEntities.length === 0) return null;

          return (
            <section key={room.id}>
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
                {room.name}
              </h2>
              <TileGrid
                entities={roomEntities}
                instanceId={instanceId}
                getPending={getPending}
                onCall={onCall}
                t={t}
              />
            </section>
          );
        })}

        {unassigned.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
              {t("homeAllRooms")}
            </h2>
            <TileGrid
              entities={unassigned}
              instanceId={instanceId}
              getPending={getPending}
              onCall={onCall}
              t={t}
            />
          </section>
        )}
      </div>
    </div>
  );
}
