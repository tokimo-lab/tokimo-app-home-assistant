import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useCallback, useEffect, useState } from "react";
import { rescanInstance } from "../../api/client";
import { clearEntities } from "../../state/entityStore";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import { useDragHandlers } from "../../state/useDragHandlers";
import { useEditHomeView } from "../../state/useEditHomeView";
import { useFilterChip } from "../../state/useFilterChip";
import { useHomePageData } from "../../state/useHomePageData";
import { useTileContextMenu } from "../../state/useTileContextMenu";
import { useToggleSizeRegistry } from "../../state/useToggleSizeRegistry";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { EmptyState } from "../EmptyState";
import { EditModeToolbar } from "../edit/EditModeToolbar";
import { FilterChipBar } from "./FilterChipBar";
import { HomePageHeader } from "./HomePageHeader";
import { HomePageSections } from "./HomePageSections";
import { RescanModal } from "./RescanModal";
import { TileContextMenu } from "./TileContextMenu";

interface HomePageProps {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  instances: HaInstance[];
  onSwitchInstance: (id: string) => void;
  ctx: AppRuntimeCtx;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onOpenRoom: (roomId: string) => void;
  onOpenSettings: () => void;
  onAddRoom: () => void;
  onAddNewHome: () => void;
  t: (k: string) => string;
}

/**
 * Top-level orchestration for the Home page: composes the chip filter,
 * data hooks, drag handlers, context menu, and edit-mode toolbar around
 * the section renderer. Layout/data details live in dedicated hooks +
 * sub-components.
 */
export function HomePage({
  instance,
  entities,
  rooms,
  instances,
  onSwitchInstance,
  ctx,
  getPending,
  onCall,
  onOpenRoom,
  onOpenSettings,
  onAddRoom,
  onAddNewHome,
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

  const {
    allEntities,
    entitiesByRoom,
    collapsedByRoom,
    cameras,
    favorites,
    headerTitle,
  } = useHomePageData({
    instance,
    entities,
    rooms,
    selectedChip,
    t,
  });

  const { openDetail } = useDetailOverlay();
  const {
    menu,
    openMenu,
    closeMenu,
    onShowControls,
    onSetSize,
    onToggleFavorite,
    onHide,
  } = useTileContextMenu(patch, openDetail, instance.id);

  useToggleSizeRegistry(entities, patch);

  // Sibling count for the long-press menu's "Similar Accessories" item.
  // Only render the menu item when the right-clicked entity belongs to a
  // group with ≥2 members; derived from the in-memory entity map (no
  // extra fetch).
  const menuGroupSiblingCount = (() => {
    const gid = menu?.entity.group_id;
    if (!gid) return 0;
    let n = 0;
    for (const e of entities.values()) {
      if (e.group_id === gid) n++;
    }
    return n;
  })();

  const onShowSimilar = useCallback(() => {
    if (!menu?.entity.group_id) return;
    ctx.shell.openModalWindow({
      component: () => import("./SimilarEntitiesModal"),
      title: t("similarAccessories"),
      width: 480,
      height: 560,
      metadata: {
        instanceId: instance.id,
        groupId: menu.entity.group_id,
        currentEntityId: menu.entity.entity_id,
        locale: ctx.locale,
      },
    });
  }, [ctx, instance.id, menu, t]);

  const handleRemoveTile = useCallback(
    (entityId: string) => {
      // Remove from default home: hide entity (filter excludes it) and
      // clear the favorite flag so it doesn't reappear in Favorites.
      void patch(entityId, { hidden: true, is_favorite: false });
    },
    [patch],
  );

  // ESC exits edit mode (Apple Home parity). Skipped while reorderSections
  // sub-mode is active so the picker doesn't double-handle the key.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitEditMode();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, exitEditMode]);

  const [rescanOpen, setRescanOpen] = useState(false);
  const [rescanLoading, setRescanLoading] = useState(false);

  const handleRescan = async (clearData: boolean) => {
    setRescanLoading(true);
    try {
      await rescanInstance(instance.id, clearData);
      clearEntities();
      setRescanOpen(false);
    } catch (err) {
      console.error("[HomePage] rescan failed", err);
    } finally {
      setRescanLoading(false);
    }
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

  const headerEl = editMode ? (
    <EditModeToolbar
      title={instance.name}
      onDone={exitEditMode}
      subtitle={reorderSections ? t("reorderSections") : undefined}
      muted={reorderSections}
      t={t}
    />
  ) : (
    <HomePageHeader
      title={headerTitle}
      instanceId={instance.id}
      instanceBaseUrl={instance.base_url}
      rooms={rooms}
      instances={instances}
      currentInstanceId={instance.id}
      onSwitchInstance={onSwitchInstance}
      t={t}
      onOpenSettings={onOpenSettings}
      onAddRoom={onAddRoom}
      onAddNewHome={onAddNewHome}
      onEnterEditMode={enterEditMode}
      onEnterReorderSections={enterReorderSections}
      onOpenRoom={onOpenRoom}
      onRescan={() => setRescanOpen(true)}
    />
  );

  if (allEntities.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col px-6 py-6">
          {headerEl}
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title={t("homeEmpty")} />
          </div>
        </div>
        <RescanModal
          open={rescanOpen}
          loading={rescanLoading}
          t={t}
          onConfirm={handleRescan}
          onCancel={() => setRescanOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative flex h-full flex-col">
        <div className="shrink-0 px-6 pt-6 pb-3">{headerEl}</div>
        {!reorderSections && (
          <div className="shrink-0 px-6 pb-3">
            <FilterChipBar
              availableChips={availableChips}
              selectedChip={selectedChip}
              onSelectChip={selectChip}
              entities={entities}
              t={t}
            />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-5 overflow-auto px-6 pb-6">
          <HomePageSections
            instance={instance}
            entities={entities}
            rooms={rooms}
            cameras={cameras}
            favorites={favorites}
            entitiesByRoom={entitiesByRoom}
            collapsedByRoom={collapsedByRoom}
            selectedChip={selectedChip}
            editMode={editMode}
            reorderSections={reorderSections}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onSectionDragEnd={handleSectionDragEnd}
            getPending={getPending}
            onCall={onCall}
            onContextMenu={openMenu}
            onOpenRoom={onOpenRoom}
            onRemoveTile={handleRemoveTile}
            removeLabel={t("removeFromHome")}
            t={t}
          />
        </div>
        {menu && (
          <TileContextMenu
            entity={menu.entity}
            x={menu.x}
            y={menu.y}
            onClose={closeMenu}
            onShowControls={onShowControls}
            onSetSize={onSetSize}
            onToggleFavorite={onToggleFavorite}
            onHide={onHide}
            onShowSimilar={
              menuGroupSiblingCount >= 2 ? onShowSimilar : undefined
            }
            t={t}
          />
        )}
      </div>
      <RescanModal
        open={rescanOpen}
        loading={rescanLoading}
        t={t}
        onConfirm={handleRescan}
        onCancel={() => setRescanOpen(false)}
      />
    </>
  );
}
