import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useState } from "react";
import { rescanInstance } from "../../api/client";
import { clearEntities } from "../../state/entityStore";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import { useDragHandlers } from "../../state/useDragHandlers";
import { useEditHomeView } from "../../state/useEditHomeView";
import { useFilterChip } from "../../state/useFilterChip";
import { useHomePageData } from "../../state/useHomePageData";
import { useShowAll } from "../../state/useShowAll";
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
  ctx: AppRuntimeCtx;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onOpenRoom: (roomId: string) => void;
  onOpenSettings: () => void;
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
  ctx,
  getPending,
  onCall,
  onOpenRoom,
  onOpenSettings,
  t,
}: HomePageProps) {
  const { selectedChip, selectChip, availableChips } = useFilterChip();
  const { showAll, toggleShowAll } = useShowAll();
  const { patch, reorderFavoritesOptimistic, reorderRoomEntitiesOptimistic } =
    useDisplayPatch(instance.id, ctx, t);
  const {
    editMode,
    reorderSections,
    exitEditMode,
    enterEditMode,
    enterReorderSections,
  } = useEditHomeView();

  const { allEntities, entitiesByRoom, cameras, favorites, headerTitle } =
    useHomePageData({
      instance,
      entities,
      rooms,
      selectedChip,
      showAll,
      t,
    });

  const { menu, openMenu, closeMenu, onSetSize, onToggleFavorite, onHide } =
    useTileContextMenu(patch);

  useToggleSizeRegistry(entities, patch);

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
      rooms={rooms}
      t={t}
      onOpenSettings={onOpenSettings}
      onEnterEditMode={enterEditMode}
      onEnterReorderSections={enterReorderSections}
      onOpenRoom={onOpenRoom}
      onRescan={() => setRescanOpen(true)}
      showAll={showAll}
      onToggleShowAll={toggleShowAll}
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
            disableRoomCap={!!selectedChip || showAll}
            t={t}
          />
        </div>
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
