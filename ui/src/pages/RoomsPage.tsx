import { Button, Card, Input } from "@tokimo/ui";
import { Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { resolveTile } from "../components/tiles";
import { getDomain } from "../lib/domain";
import { useRooms } from "../state/useRooms";
import type { CallParams, EntityState, HaRoom, PendingOp } from "../types";

interface RoomsPageProps {
  entities: ReadonlyMap<string, EntityState>;
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

export function RoomsPage({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
}: RoomsPageProps) {
  const {
    rooms,
    loading,
    error,
    syncAreas,
    createRoom,
    deleteRoom,
    addEntity,
    removeEntity,
    reload,
  } = useRooms(instanceId);

  const [selectedRoom, setSelectedRoom] = useState<HaRoom | null>(null);
  const [addRoomName, setAddRoomName] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const allEntityIds = new Set(
    rooms.flatMap((r) => r.entities.map((e) => e.entity_id)),
  );

  const unassigned = Array.from(entities.values()).filter(
    (e) =>
      !allEntityIds.has(e.entity_id) &&
      e.state !== "unavailable" &&
      !["weather", "sun", "zone", "person"].includes(getDomain(e.entity_id)),
  );

  async function handleSync() {
    setSyncing(true);
    try {
      await syncAreas();
    } finally {
      setSyncing(false);
      reload();
    }
  }

  async function handleCreateRoom() {
    if (!addRoomName.trim()) return;
    await createRoom(addRoomName.trim());
    setAddRoomName("");
    setShowAddRoom(false);
  }

  return (
    <div className="flex h-full">
      {/* Room list sidebar */}
      <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-white/[0.08]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {t("roomsTitle")}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-white/10"
              onClick={handleSync}
              title={t("roomsSync")}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-white/10"
              onClick={() => setShowAddRoom(true)}
              title={t("roomsAdd")}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading && (
            <p className="p-2 text-xs text-[var(--text-muted)]">
              {t("loading")}
            </p>
          )}
          {error && <p className="p-2 text-xs text-red-400">{error}</p>}
          {rooms.map((room) => (
            <button
              type="button"
              key={room.id}
              className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                selectedRoom?.id === room.id
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-white/[0.06]"
              }`}
              onClick={() =>
                setSelectedRoom((r) => (r?.id === room.id ? null : room))
              }
            >
              <span className="truncate">{room.name}</span>
              <button
                type="button"
                className="cursor-pointer opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                aria-label="Delete room"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(t("roomsDeleteConfirm"))) {
                    deleteRoom(room.id);
                    if (selectedRoom?.id === room.id) setSelectedRoom(null);
                  }
                }}
              >
                <Trash2 size={12} />
              </button>
            </button>
          ))}
        </div>

        {showAddRoom && (
          <div className="border-t border-white/[0.06] p-3">
            <Input
              value={addRoomName}
              onChange={(e) => setAddRoomName(e.target.value)}
              placeholder={t("roomsNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateRoom();
                if (e.key === "Escape") setShowAddRoom(false);
              }}
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <Button size="small" variant="primary" onClick={handleCreateRoom}>
                {t("add")}
              </Button>
              <Button
                size="small"
                variant="default"
                onClick={() => setShowAddRoom(false)}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Room content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedRoom ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title={t("roomsSelectPrompt")}
              description={t("roomsSelectPromptDesc")}
            />
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              {selectedRoom.name}
            </h2>

            {/* Entities in room */}
            <div className="mb-4">
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                {t("roomsEntities")} ({selectedRoom.entities.length})
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedRoom.entities.map((re) => {
                  const entity = entities.get(re.entity_id);
                  if (!entity) return null;
                  const Tile = resolveTile(entity);
                  return (
                    <div key={re.entity_id} className="relative">
                      <Tile
                        entity={entity}
                        instanceId={instanceId}
                        pending={getPending(entity.entity_id)}
                        onCall={onCall}
                        t={t}
                      />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 z-10 cursor-pointer rounded-full bg-red-500 p-0.5 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
                        onClick={() =>
                          removeEntity(selectedRoom.id, re.entity_id)
                        }
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unassigned entities to add */}
            {unassigned.length > 0 && (
              <div className="flex-1 overflow-auto">
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  {t("roomsAddEntities")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassigned.map((entity) => (
                    <Card
                      key={entity.entity_id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/[0.1]"
                      onClick={() =>
                        addEntity(selectedRoom.id, entity.entity_id)
                      }
                    >
                      <Plus size={10} />
                      {entity.attributes.friendly_name ?? entity.entity_id}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
