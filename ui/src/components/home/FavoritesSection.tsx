import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { CallParams, EntityState, PendingOp } from "../../types";
import { DroppableSection } from "../edit/DroppableSection";
import { TileGrid } from "./TileGrid";

interface FavoritesSectionProps {
  favorites: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  t: (k: string) => string;
}

export const FAVORITES_CONTAINER_ID = "favorites";

export function FavoritesSection({
  favorites,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  t,
}: FavoritesSectionProps) {
  const { editMode } = useEditHomeView();
  if (favorites.length === 0 && !editMode) return null;

  const header = (
    <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
      {t("ha.section.favorites")}
    </h2>
  );

  const grid = (
    <TileGrid
      entities={favorites}
      instanceId={instanceId}
      getPending={getPending}
      onCall={onCall}
      onContextMenu={onContextMenu}
      editMode={editMode}
      sortableContainerId={editMode ? FAVORITES_CONTAINER_ID : undefined}
      t={t}
    />
  );

  if (editMode) {
    return (
      <DroppableSection
        containerId={FAVORITES_CONTAINER_ID}
        header={header}
        active
      >
        <SortableContext
          id={FAVORITES_CONTAINER_ID}
          items={favorites.map((e) => e.entity_id)}
          strategy={rectSortingStrategy}
        >
          {grid}
        </SortableContext>
      </DroppableSection>
    );
  }

  return (
    <section>
      {header}
      {grid}
    </section>
  );
}
