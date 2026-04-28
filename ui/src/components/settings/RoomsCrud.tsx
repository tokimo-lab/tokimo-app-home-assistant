import { Button, Input } from "@tokimo/ui";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createRoom as apiCreateRoom,
  deleteRoom as apiDeleteRoom,
  updateRoom as apiUpdateRoom,
} from "../../api/rooms";
import type { HaRoom } from "../../types";

interface RoomsCrudProps {
  instanceId: string;
  rooms: HaRoom[];
  onChanged: () => Promise<unknown> | undefined;
  t: (k: string) => string;
}

/**
 * Pure rooms CRUD list — extracted from RoomsTab so HomeSettingsPage can
 * render add / rename / delete without the legacy reorder + sync-areas UI
 * (those move to Edit Home View per plan v3 §1.9).
 */
export function RoomsCrud({ instanceId, rooms, onChanged, t }: RoomsCrudProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function commitAdd() {
    const trimmed = newName.trim();
    if (trimmed === "") {
      setAdding(false);
      setNewName("");
      return;
    }
    setError(null);
    try {
      await apiCreateRoom(instanceId, { name: trimmed });
      setNewName("");
      setAdding(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rooms.length === 0 && !adding && (
        <p className="px-1 text-xs text-white/50 dark:text-white/50">
          {t("roomsCrudEmpty")}
        </p>
      )}

      {rooms.map((room) => (
        <RoomRow
          key={room.id}
          instanceId={instanceId}
          room={room}
          onChanged={onChanged}
          t={t}
        />
      ))}

      {adding ? (
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
            placeholder={t("roomsCrudNewPlaceholder")}
          />
          <button
            type="button"
            onClick={() => void commitAdd()}
            aria-label={t("roomsCrudConfirmAdd")}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-green-400 hover:bg-white/[0.08]"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            aria-label={t("roomsCrudCancelAdd")}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-white/60 hover:bg-white/[0.08]"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <Button
          variant="default"
          onClick={() => setAdding(true)}
          className="self-start"
        >
          <span className="flex items-center gap-1.5">
            <Plus size={12} />
            {t("roomsCrudAdd")}
          </span>
        </Button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function RoomRow({
  instanceId,
  room,
  onChanged,
  t,
}: {
  instanceId: string;
  room: HaRoom;
  onChanged: () => Promise<unknown> | undefined;
  t: (k: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(room.name), [room.name]);

  async function commitRename() {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === room.name) {
      setEditing(false);
      setDraft(room.name);
      return;
    }
    setBusy(true);
    try {
      await apiUpdateRoom(instanceId, room.id, { name: trimmed });
      await onChanged();
    } catch (e) {
      console.warn("[ha:roomsCrud] rename failed", e);
      setDraft(room.name);
    } finally {
      setEditing(false);
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(t("roomsCrudDeleteConfirm").replace("{name}", room.name))) {
      return;
    }
    setBusy(true);
    try {
      await apiDeleteRoom(instanceId, room.id);
      await onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 text-sm">
      <span className="shrink-0 text-base text-white/70 dark:text-white/70">
        {room.icon && room.icon.length > 0 ? room.icon : "🏠"}
      </span>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: explicit edit affordance
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") {
              setDraft(room.name);
              setEditing(false);
            }
          }}
          disabled={busy}
          className="flex-1 rounded bg-white/[0.08] px-2 py-1 text-sm text-white outline-none ring-1 ring-blue-400/60"
        />
      ) : (
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
      )}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={t("roomsCrudDelete")}
        title={t("roomsCrudDelete")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-white/40 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
