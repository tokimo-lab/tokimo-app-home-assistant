import type { AppRuntimeCtx } from "@tokimo/sdk";
import { ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
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
 * Domain priority inside a room (plan §1.2 chip ordering carried over
 * to per-room sections). `security` aggregates `lock`; `speakers_tvs`
 * aggregates `media_player`. Sensors and other read-only domains fall
 * into the trailing "other" bucket.
 */
const DOMAIN_PRIORITY: ReadonlyArray<{ key: string; domains: string[] }> = [
  { key: "climate", domains: ["climate"] },
  { key: "light", domains: ["light"] },
  { key: "security", domains: ["lock"] },
  { key: "speakers_tvs", domains: ["media_player"] },
  { key: "covers", domains: ["cover"] },
  {
    key: "switches",
    domains: ["switch", "input_boolean", "automation", "scene", "script"],
  },
  { key: "fans", domains: ["fan"] },
  { key: "other", domains: ["binary_sensor", "sensor", "camera", "vacuum"] },
];

const SECTION_TITLE_KEY: Record<string, string> = {
  climate: "domainClimate",
  light: "domainLight",
  security: "domainLock",
  speakers_tvs: "domainMediaPlayer",
  covers: "domainCover",
  switches: "domainSwitch",
  fans: "domainFan",
  other: "domainOther",
};

const RENDERABLE_DOMAINS = new Set([
  "light",
  "switch",
  "cover",
  "climate",
  "fan",
  "lock",
  "media_player",
  "scene",
  "script",
  "binary_sensor",
  "sensor",
  "camera",
  "vacuum",
  "input_boolean",
  "automation",
]);

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

interface Bucket {
  key: string;
  titleKey: string;
  entities: EntityState[];
}

function bucketize(roomEntities: EntityState[]): Bucket[] {
  const byDomain = new Map<string, EntityState[]>();
  for (const e of roomEntities) {
    const d = getDomain(e.entity_id);
    const arr = byDomain.get(d) ?? [];
    arr.push(e);
    byDomain.set(d, arr);
  }

  const claimed = new Set<string>();
  const buckets: Bucket[] = [];
  for (const { key, domains } of DOMAIN_PRIORITY) {
    const acc: EntityState[] = [];
    for (const d of domains) {
      const list = byDomain.get(d);
      if (!list) continue;
      claimed.add(d);
      acc.push(...list);
    }
    if (acc.length > 0) {
      buckets.push({
        key,
        titleKey: SECTION_TITLE_KEY[key] ?? "domainOther",
        entities: acc,
      });
    }
  }

  // Anything not claimed (e.g. unexpected domains) falls into "other".
  const leftover: EntityState[] = [];
  for (const [d, list] of byDomain) {
    if (!claimed.has(d)) leftover.push(...list);
  }
  if (leftover.length > 0) {
    const existingOther = buckets.find((b) => b.key === "other");
    if (existingOther) {
      existingOther.entities.push(...leftover);
    } else {
      buckets.push({
        key: "other",
        titleKey: "domainOther",
        entities: leftover,
      });
    }
  }

  return buckets;
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
  const buckets = useMemo(() => bucketize(roomEntities), [roomEntities]);

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
      <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-sm text-zinc-700 transition hover:bg-black/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
          aria-label={t("roomBack")}
        >
          <ChevronLeft size={18} />
          <span>{t("roomBack")}</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500"
            aria-label="add"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            disabled
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500"
            aria-label="more"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-6 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {room.name}
        </h1>

        <RoomEnvBadges entities={roomEntities} t={t} />

        {buckets.map((b) => (
          <RoomDomainSection
            key={b.key}
            titleKey={b.titleKey}
            entities={b.entities}
            instanceId={instance.id}
            getPending={getPending}
            onCall={onCall}
            t={t}
          />
        ))}

        {buckets.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("homeEmpty")}
          </p>
        )}
      </div>
    </div>
  );
}
