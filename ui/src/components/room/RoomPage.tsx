import type { AppRuntimeCtx } from "@tokimo/sdk";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { getDomain } from "../../lib/domain";
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
  entities: ReadonlyMap<string, EntityState>;
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

function isRenderable(entity: EntityState): boolean {
  return (
    RENDERABLE_DOMAINS.has(getDomain(entity.entity_id)) &&
    entity.state !== "unavailable" &&
    !(entity.hidden ?? entity.override?.hidden ?? false)
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
    if (e && isRenderable(e)) out.push(e);
  }
  out.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return out;
}

interface DomainGroup {
  domain: string;
  titleKey: string;
  entities: EntityState[];
}

function groupByDomain(roomEntities: EntityState[]): DomainGroup[] {
  const byDomain = new Map<string, EntityState[]>();
  for (const e of roomEntities) {
    const d = getDomain(e.entity_id);
    const arr = byDomain.get(d) ?? [];
    arr.push(e);
    byDomain.set(d, arr);
  }

  const groups: DomainGroup[] = [];
  const seen = new Set<string>();
  for (const domain of DOMAIN_ORDER) {
    const list = byDomain.get(domain);
    if (!list || list.length === 0) continue;
    seen.add(domain);
    groups.push({
      domain,
      titleKey: DOMAIN_TITLE_KEY[domain] ?? "room.domain.other",
      entities: list,
    });
  }
  // Anything unexpected → "other" bucket (defensive).
  const leftover: EntityState[] = [];
  for (const [d, list] of byDomain) {
    if (!seen.has(d)) leftover.push(...list);
  }
  if (leftover.length > 0) {
    groups.push({
      domain: "other",
      titleKey: "room.domain.other",
      entities: leftover,
    });
  }
  return groups;
}

export function RoomPage({
  roomId,
  instance,
  entities,
  rooms,
  ctx: _ctx,
  getPending,
  onCall,
  onBack,
  t,
}: RoomPageProps) {
  const room = rooms.find((r) => r.id === roomId);

  const roomEntities = useMemo(
    () => (room ? resolveRoomEntities(room, entities) : []),
    [room, entities],
  );
  const groups = useMemo(() => groupByDomain(roomEntities), [roomEntities]);

  if (!room) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("errorLoad")}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-full bg-black/[0.04] px-4 py-2 text-sm text-zinc-700 transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]"
        >
          {t("roomBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/[0.05] bg-white/80 px-6 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80">
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-sm text-zinc-700 transition hover:bg-black/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
          aria-label={t("roomBack")}
        >
          <ChevronLeft size={20} />
          <span>{t("roomBack")}</span>
        </button>
        <h1 className="flex-1 truncate text-center text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {room.name}
        </h1>
        <button
          type="button"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500"
          aria-label="more"
        >
          <MoreHorizontal size={20} />
        </button>
      </header>

      <div className="flex flex-col gap-4 px-6 pt-4 pb-8">
        <RoomEnvBadges entities={roomEntities} t={t} />

        {groups.map((g) => (
          <section key={g.domain}>
            <h3 className="mt-4 mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t(g.titleKey)}
            </h3>
            <RoomDomainSection
              titleKey={g.titleKey}
              entities={g.entities}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              t={t}
              hideTitle
            />
          </section>
        ))}

        {groups.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("homeEmpty")}
          </p>
        )}
      </div>
    </div>
  );
}
