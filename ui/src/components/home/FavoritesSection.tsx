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
  onRemoveTile?: (entityId: string) => void;
  removeLabel?: string;
  t: (k: string) => string;
}

export const FAVORITES_CONTAINER_ID = "favorites";

export function FavoritesSection({
  favorites,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  onRemoveTile,
  removeLabel,
  t,
}: FavoritesSectionProps) {
  const { editMode } = useEditHomeView();

  // Apple Home parity: when no entity is favorited, hide the section
  // entirely (no heading, no empty-state hint). The section reappears
  // automatically once the user marks the first favorite. In edit mode
  // we still render the empty drop target so users can drag tiles in.
  if (favorites.length === 0 && !editMode) {
    return null;
  }

  const header = (
    <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
      {t("sectionFavorites")}
    </h2>
  );

  const grid = (
    <TileGrid
      entityIds={favorites.map((e) => e.entity_id)}
      instanceId={instanceId}
      getPending={getPending}
      onCall={onCall}
      onContextMenu={onContextMenu}
      editMode={editMode}
      sortableContainerId={editMode ? FAVORITES_CONTAINER_ID : undefined}
      onRemoveTile={onRemoveTile}
      removeLabel={removeLabel}
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
