import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellToast } from "@tokimo/sdk/react";
import { Check, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { reorderRooms } from "../../api/display";
import type {
  HaRoom,
  RoomReorderItem,
  SyncAreasResult,
  UpdateRoomDto,
} from "../../types";
import { SortableList, SortableRow } from "./SortableRow";

interface RoomsTabProps {
  instanceId: string;
  rooms: HaRoom[];
  ctx: AppRuntimeCtx;
  onEditRoom: (roomId: string, dto: UpdateRoomDto) => Promise<unknown>;
  onReloadRooms: () => Promise<unknown> | undefined;
  onSyncAreas: () => Promise<SyncAreasResult>;
  t: (k: string) => string;
}

export function RoomsTab({
  instanceId,
  rooms,
  ctx,
  onEditRoom,
  onReloadRooms,
  onSyncAreas,
  t,
}: RoomsTabProps) {
  const toast = useShellToast(ctx);
  const [syncing, setSyncing] = useState(false);

  async function runSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await onSyncAreas();
      toast.success(`${t("roomsSyncDone")} (+${r.created} / ~${r.updated})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  // Local optimistic ordering — sourced from rooms by id.
  const [orderIds, setOrderIds] = useState<string[]>([]);
  useEffect(() => {
    setOrderIds(rooms.map((r) => r.id));
  }, [rooms]);

  const orderedRooms = useMemo(() => {
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const out: HaRoom[] = [];
    for (const id of orderIds) {
      const r = byId.get(id);
      if (r) out.push(r);
    }
    // Append any room not in orderIds (newly arrived via SSE).
    for (const r of rooms) {
      if (!orderIds.includes(r.id)) out.push(r);
    }
    return out;
  }, [orderIds, rooms]);

  async function commitOrder(newIds: string[]) {
    setOrderIds(newIds);
    const items: RoomReorderItem[] = newIds.map((id, i) => ({
      room_id: id,
      sort_order: i,
    }));
    try {
      await reorderRooms(instanceId, items);
      await onReloadRooms();
    } catch (e) {
      console.warn("[ha:rooms] reorder failed", e);
    }
  }

  function move(idx: number, dir: -1 | 1) {
    const next = orderedRooms.slice().map((r) => r.id);
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    void commitOrder(next);
  }

  if (orderedRooms.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SyncBar t={t} syncing={syncing} onSync={runSync} />
        <p className="text-sm text-white/60">{t("settingsRoomsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SyncBar t={t} syncing={syncing} onSync={runSync} />
      <SortableList
        items={orderedRooms}
        onReorder={(ids) => void commitOrder(ids)}
        renderRow={(room) => {
          const idx = orderedRooms.findIndex((r) => r.id === room.id);
          return (
            <SortableRow
              key={room.id}
              id={room.id}
              isFirst={idx === 0}
              isLast={idx === orderedRooms.length - 1}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              t={t}
            >
              <RoomIconEditor
                room={room}
                onChange={(icon) => onEditRoom(room.id, { icon })}
                t={t}
              />
              <RoomNameEditor
                room={room}
                onRename={(name) => onEditRoom(room.id, { name })}
              />
            </SortableRow>
          );
        }}
      />
    </div>
  );
}

function SyncBar({
  t,
  syncing,
  onSync,
}: {
  t: (k: string) => string;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-white/50">{t("roomsSyncDescription")}</p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw size={12} className={syncing ? "animate-spin" : undefined} />
        {syncing ? t("roomsSyncing") : t("roomsSyncAreas")}
      </button>
    </div>
  );
}

function RoomIconEditor({
  room,
  onChange,
  t,
}: {
  room: HaRoom;
  onChange: (icon: string) => Promise<unknown>;
  t: (k: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.icon ?? "");

  useEffect(() => setDraft(room.icon ?? ""), [room.icon]);

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === (room.icon ?? "")) {
      setEditing(false);
      return;
    }
    try {
      await onChange(trimmed);
    } catch (e) {
      console.warn("[ha:rooms] icon update failed", e);
      setDraft(room.icon ?? "");
    } finally {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: explicit edit affordance
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(room.icon ?? "");
            setEditing(false);
          }
        }}
        placeholder={t("roomsIconPlaceholder")}
        className="w-24 shrink-0 rounded bg-white/[0.08] px-2 py-1 text-sm text-white outline-none ring-1 ring-blue-400/60"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t("roomsIconEditTitle")}
      className="flex h-7 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-sm text-white/70 transition hover:border-white/20 hover:text-white"
    >
      {room.icon && room.icon.length > 0 ? (
        <span className="truncate">{room.icon}</span>
      ) : (
        <Pencil size={11} className="text-white/30" />
      )}
    </button>
  );
}

function RoomNameEditor({
  room,
  onRename,
}: {
  room: HaRoom;
  onRename: (name: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);

  useEffect(() => setDraft(room.name), [room.name]);

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === room.name) {
      setEditing(false);
      setDraft(room.name);
      return;
    }
    try {
      await onRename(trimmed);
    } catch (e) {
      console.warn("[ha:rooms] rename failed", e);
      setDraft(room.name);
    } finally {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-1 items-center gap-1">
        <input
          // biome-ignore lint/a11y/noAutofocus: explicit edit affordance
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(room.name);
              setEditing(false);
            }
          }}
          className="flex-1 rounded bg-white/[0.08] px-2 py-1 text-sm text-white outline-none ring-1 ring-blue-400/60"
        />
        <Check size={14} className="text-white/40" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex flex-1 cursor-pointer items-center gap-2 truncate rounded px-1 py-1 text-left hover:bg-white/[0.04]"
    >
      <span className="truncate">{room.name}</span>
      <Pencil
        size={12}
        className="text-white/30 opacity-0 transition group-hover:opacity-100"
      />
    </button>
  );
}
