import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
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
import { HomeMenu } from "./HomeMenu";
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
  const headerProps = { instance, rooms, t, onOpenSettings, onOpenRoom };
  const allEntities = Array.from(entities.values()).filter(isRenderable);

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
        <HomeHeader {...headerProps} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("homeEmpty")} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col gap-6 overflow-auto px-6 py-6">
      <HomeHeader {...headerProps} />

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
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenRoom(room.id)}
                className="cursor-pointer text-left text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
              >
                {room.name}
              </button>
            </div>
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
        <UnassignedSection
          entities={unassigned.slice().sort(sortBySortOrder)}
          instanceId={instance.id}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
    </div>
  );
}

function UnassignedSection({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
}: {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-3 flex w-full cursor-pointer items-center gap-2 text-left text-base font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent,#6366f1)]"
      >
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        {/* TODO(R7): i18n */}
        <span>其他 ({entities.length})</span>
      </button>
      {expanded && (
        <FlowGrid
          entities={entities}
          instanceId={instanceId}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
    </section>
  );
}

function HomeHeader({
  instance,
  rooms,
  t,
  onOpenSettings,
  onOpenRoom,
}: {
  instance: HaInstance;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onOpenRoom: (roomId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {instance.name}
      </h1>
      <HomeMenu
        rooms={rooms}
        t={t}
        onOpenSettings={onOpenSettings}
        onOpenRoom={onOpenRoom}
      />
    </div>
  );
}
