import { getDomain } from "../../lib/domain";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
  UpdateEntityDisplayDto,
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
  onToggleEdit?: () => void;
  onReorderRooms?: () => void;
  editMode?: boolean;
  onPatchDisplay?: (
    entityId: string,
    dto: UpdateEntityDisplayDto,
  ) => void | Promise<void>;
  t: (k: string) => string;
}

const noop = () => {};

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
  onToggleEdit,
  onReorderRooms,
  editMode = false,
  onPatchDisplay,
  t,
}: HomeViewProps) {
  const headerProps = {
    instance,
    rooms,
    t,
    onOpenSettings,
    onToggleEdit: onToggleEdit ?? noop,
    onReorderRooms: onReorderRooms ?? noop,
    onOpenRoom,
    editMode,
  };
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

      {editMode && (
        <button
          type="button"
          onClick={onToggleEdit ?? noop}
          className="sticky top-0 z-30 ml-auto flex h-9 cursor-pointer items-center gap-2 self-end rounded-full bg-[var(--accent,#6366f1)] px-4 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
        >
          {t("done")}
        </button>
      )}

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
            editMode={editMode}
            onPatchDisplay={onPatchDisplay}
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
              editMode={editMode}
              onPatchDisplay={onPatchDisplay}
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
            editMode={editMode}
            onPatchDisplay={onPatchDisplay}
          />
        </section>
      )}
    </div>
  );
}

function HomeHeader({
  instance,
  rooms,
  t,
  onOpenSettings,
  onToggleEdit,
  onReorderRooms,
  onOpenRoom,
  editMode,
}: {
  instance: HaInstance;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onToggleEdit: () => void;
  onReorderRooms: () => void;
  onOpenRoom: (roomId: string) => void;
  editMode: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {instance.name}
        {editMode && (
          <span className="ml-3 text-sm font-normal text-[var(--text-secondary)]">
            · {t("editHomeView")}
          </span>
        )}
      </h1>
      <HomeMenu
        rooms={rooms}
        t={t}
        onOpenSettings={onOpenSettings}
        onToggleEdit={onToggleEdit}
        onReorderRooms={onReorderRooms}
        onOpenRoom={onOpenRoom}
      />
    </div>
  );
}
