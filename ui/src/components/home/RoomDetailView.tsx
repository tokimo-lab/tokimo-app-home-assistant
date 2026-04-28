import type { AppRuntimeCtx } from "@tokimo/sdk";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { getDomain } from "../../lib/domain";
import { useDisplayPatch } from "../../state/useDisplayPatch";
import type {
  CallParams,
  EntitySize,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { FlowGrid } from "./FlowGrid";
import { StatusBadgesRow } from "./StatusBadgesRow";
import { TileContextMenu } from "./TileContextMenu";

interface RoomDetailViewProps {
  instance: HaInstance;
  room: HaRoom;
  entities: ReadonlyMap<string, EntityState>;
  ctx: AppRuntimeCtx;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  onBack: () => void;
  t: (k: string) => string;
}

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

const DOMAIN_ORDER: string[] = [
  "climate",
  "light",
  "switch",
  "fan",
  "cover",
  "media_player",
  "lock",
  "scene",
  "script",
  "vacuum",
  "camera",
  "binary_sensor",
  "sensor",
  "automation",
  "input_boolean",
];

const DOMAIN_LABEL_KEY: Record<string, string> = {
  climate: "domainClimate",
  light: "domainLight",
  switch: "domainSwitch",
  fan: "domainFan",
  cover: "domainCover",
  media_player: "domainMediaPlayer",
  lock: "domainLock",
  scene: "domainScene",
  script: "domainScript",
  vacuum: "domainVacuum",
  camera: "domainCamera",
  binary_sensor: "domainBinarySensor",
  sensor: "domainSensor",
  automation: "domainAutomation",
  input_boolean: "domainInputBoolean",
};

function domainBucket(domain: string): string {
  return DOMAIN_ORDER.includes(domain) ? domain : "other";
}

interface MenuState {
  entity: EntityState;
  x: number;
  y: number;
}

export function RoomDetailView({
  instance,
  room,
  entities,
  ctx,
  getPending,
  onCall,
  onBack,
  t,
}: RoomDetailViewProps) {
  const { patch, reorderRoomEntitiesOptimistic } = useDisplayPatch(
    instance.id,
    ctx,
    t,
  );
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Resolve entities for this room: prefer area_id; fall back to legacy room.entities list.
  const byId = new Set<string>();
  for (const e of entities.values()) {
    if (e.area_id === room.id) byId.add(e.entity_id);
  }
  for (const re of room.entities) {
    byId.add(re.entity_id);
  }

  const roomEntities: EntityState[] = [];
  for (const id of byId) {
    const e = entities.get(id);
    if (e && isRenderable(e)) roomEntities.push(e);
  }

  // Group by domain bucket
  const grouped = new Map<string, EntityState[]>();
  for (const e of roomEntities) {
    const bucket = domainBucket(getDomain(e.entity_id));
    const arr = grouped.get(bucket) ?? [];
    arr.push(e);
    grouped.set(bucket, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const orderedKeys = [...DOMAIN_ORDER, "other"].filter((k) => grouped.has(k));

  const onContextMenu = (entity: EntityState, e: React.MouseEvent) => {
    setMenu({ entity, x: e.clientX, y: e.clientY });
  };
  const closeMenu = () => setMenu(null);
  const onSetSize = (size: EntitySize) => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { size });
  };
  const onToggleFavorite = (next: boolean) => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { is_favorite: next });
  };
  const onHide = () => {
    if (!menu) return;
    void patch(menu.entity.entity_id, { hidden: true });
  };
  const onReorder = (orderedIds: string[]) => {
    void reorderRoomEntitiesOptimistic(
      orderedIds.map((id, i) => ({ entity_id: id, sort_order: i })),
    );
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto px-6 py-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/[0.06]"
          aria-label={t("roomBack")}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {room.name}
        </h1>
      </div>

      <StatusBadgesRow entities={roomEntities} t={t} />

      {orderedKeys.map((key) => {
        const list = grouped.get(key);
        if (!list || list.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
              {t(DOMAIN_LABEL_KEY[key] ?? "domainOther")}
            </h2>
            <FlowGrid
              entities={list}
              instanceId={instance.id}
              getPending={getPending}
              onCall={onCall}
              onContextMenu={onContextMenu}
              onReorder={onReorder}
              t={t}
            />
          </section>
        );
      })}

      {menu && (
        <TileContextMenu
          entity={menu.entity}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onSetSize={onSetSize}
          onToggleFavorite={onToggleFavorite}
          onHide={onHide}
          t={t}
        />
      )}
    </div>
  );
}
