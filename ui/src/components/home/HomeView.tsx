import type { AppRuntimeCtx } from "@tokimo/sdk";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getDomain } from "../../lib/domain";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import type {
  CallParams,
  EntitySize,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { EmptyState } from "../EmptyState";
import { FlowGrid } from "./FlowGrid";
import { HomeMenu } from "./HomeMenu";
import { StatusBadgesRow } from "./StatusBadgesRow";
import { TileContextMenu } from "./TileContextMenu";

interface HomeViewProps {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  ctx: AppRuntimeCtx;
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

interface MenuState {
  entity: EntityState;
  x: number;
  y: number;
}

export function HomeView({
  instance,
  entities,
  rooms,
  ctx,
  getPending,
  onCall,
  onOpenRoom,
  onOpenSettings,
  t,
}: HomeViewProps) {
  const { patch, reorderFavoritesOptimistic, reorderRoomEntitiesOptimistic } =
    useDisplayPatch(instance.id, ctx, t);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const headerProps = { instance, rooms, t, onOpenSettings, onOpenRoom };
  const allEntities = useMemo(
    () => Array.from(entities.values()).filter(isRenderable),
    [entities],
  );

  const favorites = useMemo(
    () =>
      allEntities
        .filter((e) => e.is_favorite)
        .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0)),
    [allEntities],
  );

  // Build entity → room mapping. Prefer entity.area_id, fall back to room.entities legacy list.
  const entityRoomId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEntities) {
      if (e.area_id) map.set(e.entity_id, e.area_id);
    }
    for (const room of rooms) {
      for (const re of room.entities) {
        if (!map.has(re.entity_id)) {
          map.set(re.entity_id, room.id);
        }
      }
    }
    return map;
  }, [allEntities, rooms]);

  const entitiesByRoom = useMemo(() => {
    const map = new Map<string, EntityState[]>();
    for (const e of allEntities) {
      const rid = entityRoomId.get(e.entity_id);
      if (rid) {
        const arr = map.get(rid) ?? [];
        arr.push(e);
        map.set(rid, arr);
      }
    }
    return map;
  }, [allEntities, entityRoomId]);

  const unassigned = useMemo(
    () => allEntities.filter((e) => !entityRoomId.has(e.entity_id)),
    [allEntities, entityRoomId],
  );

  const onContextMenu = (entity: EntityState, e: React.MouseEvent) => {
    setMenu({ entity, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenu(null);

  const onSetSize = (size: EntitySize) => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { size });
  };
  const onToggleFavorite = (next: boolean) => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { is_favorite: next });
  };
  const onHide = () => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { hidden: true });
  };

  const onFavoritesReorder = (orderedIds: string[]) => {
    void reorderFavoritesOptimistic(
      orderedIds.map((id, i) => ({ entity_id: id, favorite_order: i })),
    );
  };

  const onRoomReorder = (orderedIds: string[]) => {
    void reorderRoomEntitiesOptimistic(
      orderedIds.map((id, i) => ({ entity_id: id, sort_order: i })),
    );
  };

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
            onContextMenu={onContextMenu}
            onReorder={onFavoritesReorder}
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
              onContextMenu={onContextMenu}
              onReorder={onRoomReorder}
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
          onContextMenu={onContextMenu}
          t={t}
        />
      )}

      {menu && (
        <TileContextMenu
          entity={menu.entity}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onSetSize={onSetSize}
          onToggleFavorite={onToggleFavorite}
          onHide={onHide}
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
  onContextMenu,
  t,
}: {
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu: (entity: EntityState, e: React.MouseEvent) => void;
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
        <span>
          {t("domainOther")} ({entities.length})
        </span>
      </button>
      {expanded && (
        <FlowGrid
          entities={entities}
          instanceId={instanceId}
          getPending={getPending}
          onCall={onCall}
          onContextMenu={onContextMenu}
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
