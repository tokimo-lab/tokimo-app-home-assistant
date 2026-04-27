import { useCallback, useEffect, useState } from "react";
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
  SyncAreasResult,
  UpdateRoomDto,
} from "../types";

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
  };
}
