import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CallParams, EntityState, PendingOp } from "../../types";
import { TileGrid } from "../home/TileGrid";

interface RoomDomainSectionProps {
  /** i18n key resolved by parent (e.g. "room.domain.climate"). */
  titleKey: string;
  entities: EntityState[];
  /**
   * Default-hidden secondary entities for this domain. Rendered inline
   * below the visible grid when the user expands the section (or when
   * `forceExpand` is on via the room ⋯ menu).
   */
  collapsed?: EntityState[];
  /** When true, force-expand collapsed regardless of local state. */
  forceExpand?: boolean;
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
  collapsed = [],
  forceExpand = false,
  instanceId,
  getPending,
  onCall,
  t,
  hideTitle = false,
}: RoomDomainSectionProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpand || localExpanded;

  // Hide the section entirely when nothing renders. Force-expand keeps
  // the section visible even with zero visible entities so "Show All
  // Devices" surfaces collapsed-only domains.
  if (entities.length === 0 && (!forceExpand || collapsed.length === 0)) {
    return null;
  }

  const collapsedCount = collapsed.length;
  const showToggle = collapsedCount > 0 && !forceExpand;

  return (
    <section>
      {!hideTitle && (
        <h2 className="mb-3 text-base font-semibold text-fg-primary">
          {t(titleKey)}
        </h2>
      )}
      {entities.length > 0 && (
        <TileGrid
          entityIds={entities.map((e) => e.entity_id)}
          instanceId={instanceId}
          getPending={getPending}
          onCall={onCall}
          t={t}
        />
      )}
      {expanded && collapsedCount > 0 && (
        <div className="mt-2 opacity-80">
          <TileGrid
            entityIds={collapsed.map((e) => e.entity_id)}
            instanceId={instanceId}
            getPending={getPending}
            onCall={onCall}
            t={t}
          />
        </div>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={() => setLocalExpanded((v) => !v)}
          className="mt-3 flex cursor-pointer items-center gap-1 text-sm text-fg-secondary transition hover:text-fg-primary text-fg-secondary dark:hover:text-fg-primary"
        >
          <ChevronDown
            size={16}
            className={localExpanded ? "rotate-180 transition" : "transition"}
          />
          <span>
            {localExpanded
              ? t("hideSecondaryDevices")
              : t("showSecondaryDevices").replace(
                  "{n}",
                  String(collapsedCount),
                )}
          </span>
        </button>
      )}
    </section>
  );
}
