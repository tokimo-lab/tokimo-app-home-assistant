import { Check, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { reorderRooms } from "../../api/display";
import type { HaRoom, RoomReorderItem, UpdateRoomDto } from "../../types";
import { SortableList, SortableRow } from "./SortableRow";

interface RoomsTabProps {
  instanceId: string;
  rooms: HaRoom[];
  onEditRoom: (roomId: string, dto: UpdateRoomDto) => Promise<unknown>;
  onReloadRooms: () => Promise<unknown> | undefined;
  t: (k: string) => string;
}

export function RoomsTab({
  instanceId,
  rooms,
  onEditRoom,
  onReloadRooms,
  t,
}: RoomsTabProps) {
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
    return <p className="text-sm text-white/60">{t("settingsRoomsEmpty")}</p>;
  }

  return (
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
            <RoomNameEditor
              room={room}
              onRename={(name) => onEditRoom(room.id, { name })}
            />
          </SortableRow>
        );
      }}
    />
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
