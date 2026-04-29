import type { CallParams, EntityState, PendingOp } from "../../types";
import { TileGrid } from "../home/TileGrid";

interface RoomDomainSectionProps {
  /** i18n key resolved by parent (e.g. "room.domain.climate"). */
  titleKey: string;
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
  /** When true, parent already rendered the section heading. */
  hideTitle?: boolean;
}

/**
 * One domain group inside a RoomPage. Renders a section heading + grid
 * of tiles via the central `resolveTile` dispatch in `TileGrid`.
 *
 * Reordering is intentionally disabled here: the room view is read-only
 * for layout. Per-domain reorder lives elsewhere (edit-home-view mode).
 */
export function RoomDomainSection({
  titleKey,
  entities,
  instanceId,
  getPending,
  onCall,
  t,
  hideTitle = false,
}: RoomDomainSectionProps) {
  if (entities.length === 0) return null;
  return (
    <section>
      {!hideTitle && (
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {t(titleKey)}
        </h2>
      )}
      <TileGrid
        entities={entities}
        instanceId={instanceId}
        getPending={getPending}
        onCall={onCall}
        t={t}
      />
    </section>
  );
}
