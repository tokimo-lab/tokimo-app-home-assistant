import type { AppRuntimeCtx } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import { useCallback, useEffect, useState } from "react";
import { rescanInstance } from "../../api/client";
import { clearEntities } from "../../state/entityStore";
import { useAccessories, useEntityAccessory } from "../../state/useAccessories";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import { useDragHandlers } from "../../state/useDragHandlers";
import { useEditHomeView } from "../../state/useEditHomeView";
import { useFilterChip } from "../../state/useFilterChip";
import { useHomePageData } from "../../state/useHomePageData";
import { useTileContextMenu } from "../../state/useTileContextMenu";
import { useToggleSizeRegistry } from "../../state/useToggleSizeRegistry";
import type { CallParams, HaInstance, HaRoom, PendingOp } from "../../types";
import { EmptyState } from "../EmptyState";
import { BottomActionBar } from "../edit/BottomActionBar";
import { EditModeToolbar } from "../edit/EditModeToolbar";
import { FilterChipBar } from "./FilterChipBar";
import { HomePageHeader } from "./HomePageHeader";
import { HomePageSections } from "./HomePageSections";
import { RescanModal } from "./RescanModal";
import { TileContextMenu } from "./TileContextMenu";

interface HomePageProps {
  instance: HaInstance;
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
    selectedTileIds,
    clearSelection,
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

  useToggleSizeRegistry(patch);

  // Drives the per-instance accessory cache; downstream hooks
  // (useEntityAccessory, useHomePageData) read from the snapshot.
  const accessoriesSnap = useAccessories(instance.id);

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

  // Resolve {groupId, members[]} for each currently-selected tile by
  // matching the selected primary entity_id against the group where it's
  // is_primary=true. Falls back to the first group containing the entity
  // when no is_primary match is found (e.g. cache lag).
  const resolveSelectedGroups = useCallback((): {
    groupIds: string[];
    memberEntityIds: string[];
  } => {
    const groupIds: string[] = [];
    const memberSet = new Set<string>();
    for (const eid of selectedTileIds) {
      const candidates = accessoriesSnap.entityToGroups.get(eid) ?? [];
      let matched: string | null = null;
      for (const gid of candidates) {
        const members = accessoriesSnap.membersByGroup.get(gid) ?? [];
        if (members.some((m) => m.entity_id === eid && m.is_primary)) {
          matched = gid;
          break;
        }
      }
      if (!matched && candidates.length > 0) matched = candidates[0]!;
      if (!matched || groupIds.includes(matched)) continue;
      groupIds.push(matched);
      const members = accessoriesSnap.membersByGroup.get(matched) ?? [];
      for (const m of members) memberSet.add(m.entity_id);
    }
    return { groupIds, memberEntityIds: Array.from(memberSet) };
  }, [selectedTileIds, accessoriesSnap]);

  const handleMerge = useCallback(() => {
    const { groupIds, memberEntityIds } = resolveSelectedGroups();
    if (groupIds.length < 2 || memberEntityIds.length === 0) return;
    const suggestedPrimaryId =
      Array.from(selectedTileIds).find((id) => memberEntityIds.includes(id)) ??
      memberEntityIds[0];
    ctx.shell.openModalWindow({
      component: () => import("../edit/MergeTilesModal"),
      title: t("mergeTilesTitle"),
      width: 560,
      height: 600,
      metadata: {
        instanceId: instance.id,
        locale: ctx.locale,
        groupIds,
        memberEntityIds,
        suggestedPrimaryId,
      },
    });
    // Don't clear selection here — leave it intact so the user can cancel
    // the modal and still see what they had picked. The modal's success
    // path triggers `refreshAccessoriesCache`, after which the old tiles
    // simply disappear from the view; we exit edit mode in the same
    // render via the effect below.
  }, [ctx, instance.id, resolveSelectedGroups, selectedTileIds, t]);

  // After merge/split succeeds the source tiles vanish from the snapshot.
  // Drop selection entries that no longer correspond to a known primary so
  // the bottom bar reflects reality.
  useEffect(() => {
    if (!editMode || selectedTileIds.size === 0) return;
    let stale = false;
    for (const id of selectedTileIds) {
      if (!accessoriesSnap.entityToGroups.has(id)) {
        stale = true;
        break;
      }
    }
    if (stale) clearSelection();
  }, [editMode, selectedTileIds, accessoriesSnap, clearSelection]);

  const handleSplit = useCallback(() => {
    const { groupIds, memberEntityIds } = resolveSelectedGroups();
    if (groupIds.length !== 1 || memberEntityIds.length < 2) return;
    const groupId = groupIds[0]!;
    ctx.shell.openModalWindow({
      component: () => import("../edit/SplitTileModal"),
      title: t("splitTileTitle"),
      width: 600,
      height: 720,
      metadata: {
        instanceId: instance.id,
        locale: ctx.locale,
        groupId,
        memberEntityIds,
      },
    });
  }, [ctx, instance.id, resolveSelectedGroups, t]);

  // The bottom action bar shows "Split" iff exactly one tile is selected
  // and it has ≥2 members.
  const canSplitSelected = (() => {
    if (selectedTileIds.size !== 1) return false;
    const { groupIds, memberEntityIds } = resolveSelectedGroups();
    return groupIds.length === 1 && memberEntityIds.length >= 2;
  })();

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
              t={t}
            />
          </div>
        )}
        <div className="flex flex-col gap-5 px-6 pb-6">
          <HomePageSections
            instance={instance}
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
      <BottomActionBar
        canSplit={canSplitSelected}
        onMerge={handleMerge}
        onSplit={handleSplit}
        t={t}
      />
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
