import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { AppRuntimeCtx } from "@tokimo/sdk";
import { Plus } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getDomain } from "../../lib/domain";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import {
  registerToggleSize,
  useEditHomeView,
} from "../../state/useEditHomeView";
import {
  type ChipId,
  domainsForChip,
  useFilterChip,
} from "../../state/useFilterChip";
import type {
  CallParams,
  EntitySize,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { EmptyState } from "../EmptyState";
import { cycleSizeFor } from "../edit/EditableTileWrapper";
import { EditModeToolbar } from "../edit/EditModeToolbar";
import { CamerasSection } from "./CamerasSection";
import { DomainSummaryBadge } from "./DomainSummaryBadge";
import { FAVORITES_CONTAINER_ID, FavoritesSection } from "./FavoritesSection";
import { FilterChipBar } from "./FilterChipBar";
import { HomeMenu } from "./HomeMenu";
import { RoomSection } from "./RoomSection";
import { TileContextMenu } from "./TileContextMenu";

interface HomePageProps {
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
  "alarm_control_panel",
]);

const ENV_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

function isRenderable(entity: EntityState): boolean {
  return (
    RENDERABLE_DOMAINS.has(getDomain(entity.entity_id)) &&
    !(entity.hidden ?? entity.override?.hidden ?? false)
  );
}

function passesChip(
  entity: EntityState,
  chipId: ChipId,
  domains: ReadonlySet<string>,
): boolean {
  const d = getDomain(entity.entity_id);
  if (!domains.has(d)) return false;
  if (chipId === "climate" && d === "sensor") {
    const dc = entity.attributes?.device_class;
    if (typeof dc !== "string" || !ENV_SENSOR_CLASSES.has(dc)) return false;
  }
  return true;
}

function bySortOrder(a: EntityState, b: EntityState): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

const MEDIUM_DEFAULT = new Set(["climate", "media_player"]);

/**
 * Mirror of TileGrid.defaultSizeFor; kept in sync so size-cycle starts
 * from the same baseline that the grid renders. If/when this divergence
 * becomes painful, hoist the helper into a shared module.
 */
function defaultSizeForEntity(entity: EntityState): EntitySize {
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

interface MenuState {
  entity: EntityState;
  x: number;
  y: number;
}

export function HomePage({
  instance,
  entities,
  rooms,
  ctx,
  getPending,
  onCall,
  onOpenRoom,
  onOpenSettings,
  t,
}: HomePageProps) {
  const { selectedChip, selectChip, availableChips } = useFilterChip();
  const { patch, reorderFavoritesOptimistic, reorderRoomEntitiesOptimistic } =
    useDisplayPatch(instance.id, ctx, t);
  const { editMode, exitEditMode, enterEditMode } = useEditHomeView();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const allEntities = useMemo(
    () => Array.from(entities.values()).filter(isRenderable),
    [entities],
  );

  // Default size resolution must match TileGrid.defaultSizeFor; we copy it
  // here so cycleSize can fall back to the same baseline when an entity
  // has no explicit `size` set yet.
  useEffect(() => {
    registerToggleSize(async (entityId: string) => {
      const entity = entities.get(entityId);
      if (!entity) return;
      const current: EntitySize = entity.size ?? defaultSizeForEntity(entity);
      const next = cycleSizeFor(entity, current);
      if (next === current) return;
      await patch(entityId, { size: next });
    });
    return () => {
      registerToggleSize(null);
    };
  }, [entities, patch]);

  const chipDomains = useMemo<ReadonlySet<string> | null>(() => {
    if (!selectedChip) return null;
    return new Set(domainsForChip(selectedChip));
  }, [selectedChip]);

  const visibleEntities = useMemo(() => {
    if (!selectedChip || !chipDomains) return allEntities;
    return allEntities.filter((e) => passesChip(e, selectedChip, chipDomains));
  }, [allEntities, selectedChip, chipDomains]);

  const entityRoomId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEntities) {
      if (e.area_id) map.set(e.entity_id, e.area_id);
    }
    for (const room of rooms) {
      for (const re of room.entities) {
        if (!map.has(re.entity_id)) map.set(re.entity_id, room.id);
      }
    }
    return map;
  }, [allEntities, rooms]);

  const entitiesByRoom = useMemo(() => {
    const map = new Map<string, EntityState[]>();
    for (const e of visibleEntities) {
      const rid = entityRoomId.get(e.entity_id);
      if (!rid) continue;
      const arr = map.get(rid) ?? [];
      arr.push(e);
      map.set(rid, arr);
    }
    return map;
  }, [visibleEntities, entityRoomId]);

  const cameras = useMemo(
    () =>
      allEntities
        .filter((e) => getDomain(e.entity_id) === "camera")
        .sort(bySortOrder),
    [allEntities],
  );

  const favorites = useMemo(
    () =>
      allEntities
        .filter((e) => e.is_favorite)
        .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0)),
    [allEntities],
  );

  const headerTitle = useMemo(() => {
    if (!selectedChip) return instance.name;
    return t(`ha.chip.${selectedChip}` as const);
  }, [selectedChip, instance.name, t]);

  const onContextMenu = (entity: EntityState, e: ReactMouseEvent) => {
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

  // ── DnD: cross-section drag in edit mode ────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const sourceContainer =
        (active.data.current?.containerId as string | undefined) ?? null;
      // `over.id` may be either an entity_id (sortable item) or a container id
      // (the section root via DroppableSection's useDroppable).
      const overId = String(over.id);
      const overContainer =
        (over.data.current?.containerId as string | undefined) ?? overId;
      if (!sourceContainer || !overContainer) return;

      const activeEntity = entities.get(activeId);
      if (!activeEntity) return;

      // ── Same container: reorder ────────────────────────────────────────
      if (sourceContainer === overContainer) {
        if (activeId === overId) return;

        if (sourceContainer === FAVORITES_CONTAINER_ID) {
          const ordered = [...favorites];
          const fromIdx = ordered.findIndex((e) => e.entity_id === activeId);
          const toIdx = ordered.findIndex((e) => e.entity_id === overId);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = ordered.splice(fromIdx, 1);
          if (moved) ordered.splice(toIdx, 0, moved);
          void reorderFavoritesOptimistic(
            ordered.map((e, i) => ({
              entity_id: e.entity_id,
              favorite_order: i,
            })),
          );
          return;
        }

        if (sourceContainer.startsWith("room:")) {
          const roomId = sourceContainer.slice("room:".length);
          const list = (entitiesByRoom.get(roomId) ?? [])
            .slice()
            .sort(bySortOrder);
          const fromIdx = list.findIndex((e) => e.entity_id === activeId);
          const toIdx = list.findIndex((e) => e.entity_id === overId);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = list.splice(fromIdx, 1);
          if (moved) list.splice(toIdx, 0, moved);
          void reorderRoomEntitiesOptimistic(
            list.map((e, i) => ({
              entity_id: e.entity_id,
              sort_order: i,
            })),
          );
          return;
        }
        return;
      }

      // ── Cross-container ────────────────────────────────────────────────
      // Drop INTO Favorites: just flip is_favorite=true. Source container
      // stays as-is (an entity can be both in a room and pinned).
      if (overContainer === FAVORITES_CONTAINER_ID) {
        void patch(activeId, { is_favorite: true });
        return;
      }
      // Drop FROM Favorites onto a room: clear is_favorite. Per spec:
      // "保留 area" — we don't move the entity between rooms here, the
      // entity stays where its area_id says it is.
      if (sourceContainer === FAVORITES_CONTAINER_ID) {
        void patch(activeId, { is_favorite: false });
        return;
      }
      // Cross-room move: patch area_id to the new room.
      // TODO(H10/backend): the spec also calls for explicit room_entities
      // row deletion + insertion. We currently rely on area_id-based
      // resolution in HomePage (see entityRoomId), which works for the
      // common case but won't update an explicit override row. Once H10
      // settles the data model, either:
      //   (a) extend `updateEntityDisplay` to atomically rewrite
      //       room_entities, or
      //   (b) add a dedicated POST /rooms/:new/entities/move endpoint.
      if (
        sourceContainer.startsWith("room:") &&
        overContainer.startsWith("room:")
      ) {
        const newRoomId = overContainer.slice("room:".length);
        void patch(activeId, { area_id: newRoomId });
        return;
      }
    },
    [
      entities,
      favorites,
      entitiesByRoom,
      patch,
      reorderFavoritesOptimistic,
      reorderRoomEntitiesOptimistic,
    ],
  );

  if (allEntities.length === 0) {
    return (
      <div className="flex h-full flex-col px-6 py-6">
        {editMode ? (
          <EditModeToolbar title={instance.name} onDone={exitEditMode} t={t} />
        ) : (
          <Header
            title={instance.name}
            instanceId={instance.id}
            rooms={rooms}
            t={t}
            onOpenSettings={onOpenSettings}
            onEnterEditMode={enterEditMode}
            onOpenRoom={onOpenRoom}
          />
        )}
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("ha.home.empty")} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col gap-5 overflow-auto px-6 py-6">
      {editMode ? (
        <EditModeToolbar title={instance.name} onDone={exitEditMode} t={t} />
      ) : (
        <Header
          title={headerTitle}
          instanceId={instance.id}
          rooms={rooms}
          t={t}
          onOpenSettings={onOpenSettings}
          onEnterEditMode={enterEditMode}
          onOpenRoom={onOpenRoom}
        />
      )}

      <FilterChipBar
        availableChips={availableChips}
        selectedChip={selectedChip}
        onSelectChip={selectChip}
        entities={entities}
        t={t}
      />

      {selectedChip ? (
        <DomainSummaryBadge chipId={selectedChip} entities={entities} t={t} />
      ) : editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {cameras.length > 0 && (
            <CamerasSection
              cameras={cameras}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              onContextMenu={onContextMenu}
              t={t}
            />
          )}
          <FavoritesSection
            favorites={favorites}
            instanceId={instance.id}
            getPending={getPending}
            onCall={onCall}
            onContextMenu={onContextMenu}
            t={t}
          />
          {rooms.map((room) => {
            const list = (entitiesByRoom.get(room.id) ?? [])
              .slice()
              .sort(bySortOrder);
            return (
              <RoomSection
                key={room.id}
                room={room}
                entities={list}
                instanceId={instance.id}
                getPending={getPending}
                onCall={onCall}
                onContextMenu={onContextMenu}
                onOpenRoom={onOpenRoom}
                t={t}
              />
            );
          })}
        </DndContext>
      ) : (
        <>
          {cameras.length > 0 && (
            <CamerasSection
              cameras={cameras}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              onContextMenu={onContextMenu}
              t={t}
            />
          )}
          {favorites.length > 0 && (
            <FavoritesSection
              favorites={favorites}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              onContextMenu={onContextMenu}
              t={t}
            />
          )}
          {rooms.map((room) => {
            const list = (entitiesByRoom.get(room.id) ?? [])
              .slice()
              .sort(bySortOrder);
            if (list.length === 0) return null;
            return (
              <RoomSection
                key={room.id}
                room={room}
                entities={list}
                instanceId={instance.id}
                getPending={getPending}
                onCall={onCall}
                onContextMenu={onContextMenu}
                onOpenRoom={onOpenRoom}
                t={t}
              />
            );
          })}
        </>
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

function Header({
  title,
  instanceId,
  rooms,
  t,
  onOpenSettings,
  onEnterEditMode,
  onOpenRoom,
}: {
  title: string;
  instanceId: string;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onEnterEditMode: () => void;
  onOpenRoom: (roomId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {title}
      </h1>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("ha.home.add")}
          onClick={() => {
            // TODO(H7+): wire add-accessory flow.
            console.log("[HomePage] add accessory clicked");
          }}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/[0.06]"
        >
          <Plus size={20} />
        </button>
        <HomeMenu
          instanceId={instanceId}
          rooms={rooms}
          t={t}
          onOpenSettings={onOpenSettings}
          onEditHomeView={onEnterEditMode}
          onReorderSections={onEnterEditMode}
          onOpenRoom={onOpenRoom}
        />
      </div>
    </div>
  );
}
