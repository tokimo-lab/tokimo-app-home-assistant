import type { AppRuntimeCtx } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
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
import { useAccessories, useEntityAccessory } from "../../state/useAccessories";

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

  // Drives the per-instance accessory cache; downstream hooks
  // (useEntityAccessory, useHomePageData) read from the snapshot.
  useAccessories(instance.id);

  // Sibling count for the long-press menu's "Similar Accessories" item.
  // Only render the menu item when the right-clicked entity belongs to a
  // group with ≥2 members.
  const menuAccessory = useEntityAccessory(menu?.entity.entity_id ?? "");
  const menuGroupSiblingCount = menuAccessory?.members.length ?? 0;

  const onShowSimilar = useCallback(() => {
    if (!menu || !menuAccessory) return;
    ctx.shell.openModalWindow({
      component: () => import("../settings/AccessorySettingsPage"),
      title: t("detailOpenSettings"),
      width: 500,
      height: 600,
      metadata: {
        instanceId: instance.id,
        entityId: menu.entity.entity_id,
        locale: ctx.locale,
        initialTab: "members",
      },
    });
  }, [ctx, instance.id, menu, menuAccessory, t]);

  const handleRemoveTile = useCallback(
    (entityId: string) => {
      // Remove from default home: hide entity (filter excludes it) and
      // clear the favorite flag so it doesn't reappear in Favorites.
      void patch(entityId, { hidden: true, is_favorite: false });
    },
    [patch],
  );

  const handleCreateTile = useCallback(() => {
    ctx.shell.openModalWindow({
      component: () => import("./CreateTileModal"),
      title: t("createTileTitle"),
      width: 560,
      height: 680,
      metadata: { instanceId: instance.id, locale: ctx.locale },
    });
  }, [ctx, instance.id, t]);

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
      onCreateTile={handleCreateTile}
      onEnterEditMode={enterEditMode}
      onEnterReorderSections={enterReorderSections}
      onOpenRoom={onOpenRoom}
      onRescan={() => setRescanOpen(true)}
    />
  );

  if (allEntities.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col px-6 pt-10 pb-6">
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
      <div className="relative h-full overflow-y-auto">
        <div className="px-6 pt-10 pb-3">{headerEl}</div>
        {!reorderSections && (
          <div
            className={cn(
              "px-6 py-3",
              selectedChip !== null &&
                "sticky top-0 z-20 border-b border-zinc-200/40 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/85",
            )}
          >
            <FilterChipBar
              availableChips={availableChips}
              selectedChip={selectedChip}
              onSelectChip={selectChip}
              entities={entities}
              t={t}
            />
          </div>
        )}
        <div className="flex flex-col gap-5 px-6 pb-6">
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
