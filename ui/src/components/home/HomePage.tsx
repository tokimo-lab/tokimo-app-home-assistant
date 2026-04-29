import { closestCenter, DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { AppRuntimeCtx } from "@tokimo/sdk";
import { Plus } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getDomain } from "../../lib/domain";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import { useDragHandlers } from "../../state/useDragHandlers";
import {
  registerToggleSize,
  useEditHomeView,
} from "../../state/useEditHomeView";
import { domainsForChip, useFilterChip } from "../../state/useFilterChip";
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
import { SectionDragRow } from "../edit/SectionDragHandle";
import {
  bySortOrder,
  CHIP_LABEL_KEY,
  defaultSizeForEntity,
  isRenderable,
  passesChip,
} from "./_helpers";
import { FilterChipBar } from "./FilterChipBar";
import { HomeMenu } from "./HomeMenu";
import { HomePageDefault } from "./HomePageDefault";
import { HomePageFiltered } from "./HomePageFiltered";
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
  const {
    editMode,
    reorderSections,
    exitEditMode,
    enterEditMode,
    enterReorderSections,
  } = useEditHomeView();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const allEntities = useMemo(
    () => Array.from(entities.values()).filter(isRenderable),
    [entities],
  );

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

  const chipDomains = useMemo<ReadonlySet<string> | null>(
    () => (selectedChip ? new Set(domainsForChip(selectedChip)) : null),
    [selectedChip],
  );
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
  const headerTitle = useMemo(
    () => (selectedChip ? t(CHIP_LABEL_KEY[selectedChip]) : instance.name),
    [selectedChip, instance.name, t],
  );

  const onContextMenu = (entity: EntityState, e: ReactMouseEvent) =>
    setMenu({ entity, x: e.clientX, y: e.clientY });
  const closeMenu = () => setMenu(null);
  const onSetSize = (size: EntitySize) => {
    if (menu) void patch(menu.entity.entity_id, { size });
  };
  const onToggleFavorite = (next: boolean) => {
    if (menu) void patch(menu.entity.entity_id, { is_favorite: next });
  };
  const onHide = () => {
    if (menu) void patch(menu.entity.entity_id, { hidden: true });
  };

  const { sensors, handleDragEnd, handleSectionDragEnd } = useDragHandlers({
    instanceId: instance.id,
    entities,
    favorites,
    entitiesByRoom,
    rooms,
    patch,
    reorderFavoritesOptimistic,
    reorderRoomEntitiesOptimistic,
  });

  const sharedSectionProps = {
    instance,
    getPending,
    onCall,
    onContextMenu,
    onOpenRoom,
    t,
    editMode,
  };
  const filteredProps = {
    ...sharedSectionProps,
    entities,
    cameras,
    rooms,
    entitiesByRoom,
  };
  const defaultProps = {
    ...sharedSectionProps,
    cameras,
    favorites,
    rooms,
    entitiesByRoom,
  };

  const headerEl = editMode ? (
    <EditModeToolbar
      title={instance.name}
      onDone={exitEditMode}
      subtitle={reorderSections ? t("reorderSections") : undefined}
      muted={reorderSections}
      t={t}
    />
  ) : (
    <Header
      title={headerTitle}
      instanceId={instance.id}
      rooms={rooms}
      t={t}
      onOpenSettings={onOpenSettings}
      onEnterEditMode={enterEditMode}
      onEnterReorderSections={enterReorderSections}
      onOpenRoom={onOpenRoom}
    />
  );

  if (allEntities.length === 0) {
    return (
      <div className="flex h-full flex-col px-6 py-6">
        {headerEl}
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("homeEmpty")} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col gap-5 overflow-auto px-6 py-6">
      {headerEl}
      {!reorderSections && (
        <FilterChipBar
          availableChips={availableChips}
          selectedChip={selectedChip}
          onSelectChip={selectChip}
          entities={entities}
          t={t}
        />
      )}
      {reorderSections ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            id="sections"
            items={rooms.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {rooms.map((room) => (
                <SectionDragRow
                  key={room.id}
                  room={room}
                  count={(entitiesByRoom.get(room.id) ?? []).length}
                  t={t}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {selectedChip ? (
            <HomePageFiltered {...filteredProps} selectedChip={selectedChip} />
          ) : (
            <HomePageDefault {...defaultProps} />
          )}
        </DndContext>
      ) : selectedChip ? (
        <HomePageFiltered {...filteredProps} selectedChip={selectedChip} />
      ) : (
        <HomePageDefault {...defaultProps} />
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
  onEnterReorderSections,
  onOpenRoom,
}: {
  title: string;
  instanceId: string;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onEnterEditMode: () => void;
  onEnterReorderSections: () => void;
  onOpenRoom: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {title}
      </h1>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("homeAdd")}
          onClick={() => {
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
          onReorderSections={onEnterReorderSections}
          onOpenRoom={onOpenRoom}
        />
      </div>
    </div>
  );
}
