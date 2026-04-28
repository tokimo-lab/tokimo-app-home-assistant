import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { reorderRooms as apiReorderRooms } from "../api/display";
import {
  addEntityToRoom,
  createRoom as apiCreateRoom,
  deleteRoom as apiDeleteRoom,
  syncAreas as apiSyncAreas,
  listRooms,
  removeEntityFromRoom,
  updateRoom,
} from "../api/rooms";
import type {
  CreateRoomDto,
  HaRoom,
  RoomReorderItem,
  SyncAreasResult,
  UpdateRoomDto,
} from "../types";
import { setActiveInstance } from "./activeInstanceStore";

export function useRooms(instanceId: string | null) {
  const [rooms, setRooms] = useState<HaRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!instanceId) {
      setRooms([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listRooms(instanceId);
      setRooms(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Instance no longer exists on backend — clear active so the
        // route guard in index.tsx can reconcile to a valid instance.
        setRooms([]);
        setActiveInstance(null, null);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createRoom = useCallback(
    async (name: string, dto?: Partial<CreateRoomDto>): Promise<HaRoom> => {
      if (!instanceId) throw new Error("No instance");
      const payload: CreateRoomDto = { name, ...dto };
      const room = await apiCreateRoom(instanceId, payload);
      setRooms((prev) => [...prev, room]);
      return room;
    },
    [instanceId],
  );

  const editRoom = useCallback(
    async (roomId: string, dto: UpdateRoomDto): Promise<HaRoom> => {
      if (!instanceId) throw new Error("No instance");
      const room = await updateRoom(instanceId, roomId, dto);
      setRooms((prev) => prev.map((r) => (r.id === roomId ? room : r)));
      return room;
    },
    [instanceId],
  );

  const deleteRoom = useCallback(
    async (roomId: string): Promise<void> => {
      if (!instanceId) throw new Error("No instance");
      await apiDeleteRoom(instanceId, roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    },
    [instanceId],
  );

  const syncAreas = useCallback(async (): Promise<SyncAreasResult> => {
    if (!instanceId) throw new Error("No instance");
    const result = await apiSyncAreas(instanceId);
    await load();
    return result;
  }, [instanceId, load]);

  const addEntity = useCallback(
    async (roomId: string, entityId: string): Promise<void> => {
      if (!instanceId) throw new Error("No instance");
      await addEntityToRoom(instanceId, roomId, entityId);
      await load();
    },
    [instanceId, load],
  );

  const removeEntity = useCallback(
    async (roomId: string, entityId: string): Promise<void> => {
      if (!instanceId) throw new Error("No instance");
      await removeEntityFromRoom(instanceId, roomId, entityId);
      await load();
    },
    [instanceId, load],
  );

  const reorderRooms = useCallback(
    async (items: RoomReorderItem[]): Promise<void> => {
      if (!instanceId) throw new Error("No instance");
      const orderById = new Map(items.map((i) => [i.room_id, i.sort_order]));
      const previous = rooms;
      // Optimistic: re-sort locally by the new sort_order.
      setRooms((prev) =>
        [...prev].sort(
          (a, b) =>
            (orderById.get(a.id) ?? Number.POSITIVE_INFINITY) -
            (orderById.get(b.id) ?? Number.POSITIVE_INFINITY),
        ),
      );
      try {
        await apiReorderRooms(instanceId, items);
      } catch (err) {
        setRooms(previous);
        throw err;
      }
    },
    [instanceId, rooms],
  );

  return {
    rooms,
    loading,
    error,
    reload: load,
    createRoom,
    editRoom,
    deleteRoom,
    syncAreas,
    addEntity,
    removeEntity,
    reorderRooms,
  };
}
