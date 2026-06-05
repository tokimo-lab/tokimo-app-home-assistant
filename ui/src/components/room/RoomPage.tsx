import {
  autoUpdate,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { AppRuntimeCtx } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import { ChevronLeft, Eye, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { getDomain } from "../../lib/domain";
import { useAccessories } from "../../state/useAccessories";
import { useEntitiesMap } from "../../state/useEntities";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { RoomDomainSection } from "./RoomDomainSection";
import { RoomEnvBadges } from "./RoomEnvBadges";

interface RoomPageProps {
  roomId: string;
  instance: HaInstance;
  rooms: HaRoom[];
  ctx: AppRuntimeCtx;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onBack: () => void;
  t: (k: string) => string;
}

/**
 * Domain rendering order inside a room, per IMG_2655 spec. Anything
 * not in this list lands in a trailing "other" group.
 */
const DOMAIN_ORDER: ReadonlyArray<string> = [
  "light",
  "switch",
  "climate",
  "fan",
  "cover",
  "media_player",
  "lock",
  "scene",
  "script",
  "input_boolean",
  "automation",
  "vacuum",
  "camera",
  "binary_sensor",
  "sensor",
];

const DOMAIN_TITLE_KEY: Record<string, string> = {
  light: "room.domain.light",
  switch: "room.domain.switch",
  climate: "room.domain.climate",
  fan: "room.domain.fan",
  cover: "room.domain.cover",
  media_player: "room.domain.media_player",
  lock: "room.domain.lock",
  scene: "room.domain.scene",
  script: "room.domain.script",
  input_boolean: "room.domain.input_boolean",
  automation: "room.domain.automation",
  vacuum: "room.domain.vacuum",
  camera: "room.domain.camera",
  binary_sensor: "room.domain.binary_sensor",
  sensor: "room.domain.sensor",
};

const RENDERABLE_DOMAINS = new Set(DOMAIN_ORDER);

function passesBase(entity: EntityState): boolean {
  return (
    RENDERABLE_DOMAINS.has(getDomain(entity.entity_id)) &&
    entity.state !== "unavailable" &&
    !(entity.hidden ?? entity.override?.hidden ?? false)
  );
}

function isVisible(
  entity: EntityState,
  secondaryIds: ReadonlySet<string>,
): boolean {
  return (
    passesBase(entity) &&
    !entity.collapsed &&
    !secondaryIds.has(entity.entity_id)
  );
}

function isSecondary(
  entity: EntityState,
  secondaryIds: ReadonlySet<string>,
): boolean {
  return (
    passesBase(entity) &&
    (entity.collapsed === true || secondaryIds.has(entity.entity_id))
  );
}

function resolveRoomEntities(
  room: HaRoom,
  entities: ReadonlyMap<string, EntityState>,
): EntityState[] {
  const ids = new Set<string>();
  for (const e of entities.values()) {
    if (e.area_id === room.id) ids.add(e.entity_id);
  }
  for (const re of room.entities) {
    ids.add(re.entity_id);
  }
  const out: EntityState[] = [];
  for (const id of ids) {
    const e = entities.get(id);
    if (e && passesBase(e)) out.push(e);
  }
  out.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return out;
}

interface DomainGroup {
  domain: string;
  titleKey: string;
  visible: EntityState[];
  collapsed: EntityState[];
}

function groupByDomain(
  roomEntities: EntityState[],
  secondaryIds: ReadonlySet<string>,
): DomainGroup[] {
  const byDomain = new Map<
    string,
    { visible: EntityState[]; collapsed: EntityState[] }
  >();
  for (const e of roomEntities) {
    const d = getDomain(e.entity_id);
    let bucket = byDomain.get(d);
    if (!bucket) {
      bucket = { visible: [], collapsed: [] };
      byDomain.set(d, bucket);
    }
    if (isVisible(e, secondaryIds)) bucket.visible.push(e);
    else if (isSecondary(e, secondaryIds)) bucket.collapsed.push(e);
  }

  const groups: DomainGroup[] = [];
  const seen = new Set<string>();
  for (const domain of DOMAIN_ORDER) {
    const bucket = byDomain.get(domain);
    if (!bucket) continue;
    if (bucket.visible.length === 0 && bucket.collapsed.length === 0) continue;
    seen.add(domain);
    groups.push({
      domain,
      titleKey: DOMAIN_TITLE_KEY[domain] ?? "room.domain.other",
      visible: bucket.visible,
      collapsed: bucket.collapsed,
    });
  }
  // Anything unexpected → "other" bucket (defensive).
  const otherVisible: EntityState[] = [];
  const otherCollapsed: EntityState[] = [];
  for (const [d, bucket] of byDomain) {
    if (seen.has(d)) continue;
    otherVisible.push(...bucket.visible);
    otherCollapsed.push(...bucket.collapsed);
  }
  if (otherVisible.length > 0 || otherCollapsed.length > 0) {
    groups.push({
      domain: "other",
      titleKey: "room.domain.other",
      visible: otherVisible,
      collapsed: otherCollapsed,
    });
  }
  return groups;
}

export function RoomPage({
  roomId,
  instance,
  rooms,
  ctx: _ctx,
  getPending,
  onCall,
  onBack,
  t,
}: RoomPageProps) {
  const room = rooms.find((r) => r.id === roomId);
  const entities = useEntitiesMap();
  const [forceExpandAll, setForceExpandAll] = useState(false);
  const { secondaryEntityIds } = useAccessories(instance.id);

  const roomEntities = useMemo(
    () => (room ? resolveRoomEntities(room, entities) : []),
    [room, entities],
  );
  const groups = useMemo(
    () => groupByDomain(roomEntities, secondaryEntityIds),
    [roomEntities, secondaryEntityIds],
  );
  const totalCollapsed = useMemo(
    () => groups.reduce((acc, g) => acc + g.collapsed.length, 0),
    [groups],
  );

  if (!room) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-6">
        <p className="text-sm text-fg-secondary">
          {t("errorLoad")}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-full bg-black/[0.04] px-4 py-2 text-sm text-fg-primary transition hover:bg-black/[0.08] dark:bg-surface-raised dark:hover:bg-white/[0.1]"
        >
          {t("roomBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="flex items-center justify-between gap-3 px-6 pt-10 pb-3 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-sm text-fg-primary transition hover:bg-black/[0.05] dark:hover:bg-surface-raised"
          aria-label={t("roomBack")}
        >
          <ChevronLeft size={20} />
          <span>{t("roomBack")}</span>
        </button>
        <h1 className="flex-1 truncate text-center text-3xl font-bold tracking-tight text-fg-primary">
          {room.name}
        </h1>
        <RoomMenu
          enabled={totalCollapsed > 0 && !forceExpandAll}
          onShowAll={() => setForceExpandAll(true)}
          t={t}
        />
      </header>

      <div className="flex flex-col gap-4 px-6 pt-4 pb-8">
        <RoomEnvBadges entities={roomEntities} t={t} />

        {groups.map((g) => (
          <section key={g.domain}>
            <h3 className="mt-4 mb-2 text-lg font-semibold text-fg-primary">
              {t(g.titleKey)}
            </h3>
            <RoomDomainSection
              titleKey={g.titleKey}
              entities={g.visible}
              collapsed={g.collapsed}
              forceExpand={forceExpandAll}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              t={t}
              hideTitle
            />
          </section>
        ))}

        {groups.length === 0 && (
          <p className="text-sm text-fg-secondary">
            {t("homeEmpty")}
          </p>
        )}
      </div>
    </div>
  );
}

interface RoomMenuProps {
  enabled: boolean;
  onShowAll: () => void;
  t: (k: string) => string;
}

function RoomMenu({ enabled, onShowAll, t }: RoomMenuProps) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted"
        aria-label="more"
      >
        <MoreHorizontal size={20} />
      </button>
    );
  }

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={t("menuOpen")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-fg-primary transition hover:bg-black/[0.05] dark:hover:bg-surface-raised"
        {...getReferenceProps()}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={cn(
              "z-[9999] min-w-[200px] overflow-hidden rounded-xl",
              "border border-black/[0.08] bg-surface-raised py-1 text-fg-primary shadow-2xl",
              "dark:border-white/[0.08] dark:bg-surface-raised",
            )}
            {...getFloatingProps()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowAll();
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              <span className="flex h-4 w-4 items-center justify-center text-fg-secondary">
                <Eye size={16} />
              </span>
              <span className="flex-1 truncate">{t("showAllDevices")}</span>
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
