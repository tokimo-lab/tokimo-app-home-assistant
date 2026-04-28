import type { CallParams, EntityState, PendingOp } from "../../types";
import { FlowGrid } from "../home/FlowGrid";

interface RoomDomainSectionProps {
  /** i18n key resolved by parent (e.g. "domainClimate"). */
  titleKey: string;
  entities: EntityState[];
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

/**
 * One domain group inside a RoomPage. Renders a section heading + flow
 * grid of tiles via the central `resolveTile` dispatch in `FlowGrid`.
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
}: RoomDomainSectionProps) {
  if (entities.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {t(titleKey)}
      </h2>
      <FlowGrid
        entities={entities}
        instanceId={instanceId}
        getPending={getPending}
        onCall={onCall}
        t={t}
      />
    </section>
  );
}
