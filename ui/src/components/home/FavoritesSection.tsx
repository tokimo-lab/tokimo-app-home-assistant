import type { MouseEvent as ReactMouseEvent } from "react";
import { useEditHomeView } from "../../state/useEditHomeView";
import type { CallParams, EntityState, PendingOp } from "../../types";
import { TileGrid } from "./TileGrid";

interface FavoritesSectionProps {
  favorites: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onContextMenu?: (entity: EntityState, e: ReactMouseEvent) => void;
  t: (k: string) => string;
}

export function FavoritesSection({
  favorites,
  instanceId,
  getPending,
  onCall,
  onContextMenu,
  t,
}: FavoritesSectionProps) {
  const { editMode } = useEditHomeView();
  if (favorites.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
        {t("ha.section.favorites")}
      </h2>
      <TileGrid
        entities={favorites}
        instanceId={instanceId}
        getPending={getPending}
        onCall={onCall}
        onContextMenu={onContextMenu}
        editMode={editMode}
        t={t}
      />
    </section>
  );
}
