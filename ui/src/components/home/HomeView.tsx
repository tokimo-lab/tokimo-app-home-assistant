import { MoreHorizontal } from "lucide-react";
import { getDomain } from "../../lib/domain";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { EmptyState } from "../EmptyState";
import { FlowGrid } from "./FlowGrid";
import { StatusBadgesRow } from "./StatusBadgesRow";

interface HomeViewProps {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onOpenRoom: (roomId: string) => void;
  onOpenSettings: () => void;
  t: (k: string) => string;
}

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
    !(entity.hidden ?? entity.override?.hidden ?? false)
  );
}

function sortBySortOrder(a: EntityState, b: EntityState): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export function HomeView({
  instance,
  entities,
  rooms,
  getPending,
  onCall,
  onOpenRoom,
  onOpenSettings,
  t,
}: HomeViewProps) {
  const allEntities = Array.from(entities.values()).filter(isRenderable);

  // Favorites
  const favorites = allEntities
    .filter((e) => e.is_favorite)
    .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0));

  // Build entity → room mapping. Prefer entity.area_id, fall back to room.entities legacy list.
  const entityRoomId = new Map<string, string>();
  for (const e of allEntities) {
    if (e.area_id) entityRoomId.set(e.entity_id, e.area_id);
  }
  for (const room of rooms) {
    for (const re of room.entities) {
      if (!entityRoomId.has(re.entity_id)) {
        entityRoomId.set(re.entity_id, room.id);
      }
    }
  }

  const entitiesByRoom = new Map<string, EntityState[]>();
  for (const e of allEntities) {
    const rid = entityRoomId.get(e.entity_id);
    if (rid) {
      const arr = entitiesByRoom.get(rid) ?? [];
      arr.push(e);
      entitiesByRoom.set(rid, arr);
    }
  }

  const unassigned = allEntities.filter((e) => !entityRoomId.has(e.entity_id));

  if (allEntities.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <HomeHeader instance={instance} onOpenSettings={onOpenSettings} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("homeEmpty")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto px-6 py-6">
      <HomeHeader instance={instance} onOpenSettings={onOpenSettings} />

      <StatusBadgesRow entities={allEntities} t={t} />

      {favorites.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            {t("sectionFavorites")}
          </h2>
          <FlowGrid
            entities={favorites}
            instanceId={instance.id}
            getPending={getPending}
            onCall={onCall}
            t={t}
          />
        </section>
      )}

      {rooms.map((room) => {
        const list = (entitiesByRoom.get(room.id) ?? [])
          .slice()
          .sort(sortBySortOrder);
        if (list.length === 0) return null;
        return (
          <section key={room.id}>
            <button
              type="button"
              onClick={() => onOpenRoom(room.id)}
              className="mb-3 cursor-pointer text-left text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
            >
              {room.name}
            </button>
            <FlowGrid
              entities={list}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              t={t}
            />
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            {t("sectionUnassigned")}
          </h2>
          <FlowGrid
            entities={unassigned.slice().sort(sortBySortOrder)}
            instanceId={instance.id}
            getPending={getPending}
            onCall={onCall}
            t={t}
          />
        </section>
      )}
    </div>
  );
}

function HomeHeader({
  instance,
  onOpenSettings,
}: {
  instance: HaInstance;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {instance.name}
      </h1>
      {/* TODO R8p: replace placeholder with proper dropdown menu */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/[0.06]"
        aria-label="menu"
      >
        <MoreHorizontal size={20} />
      </button>
    </div>
  );
}
