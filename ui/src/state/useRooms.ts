import { useCallback, useEffect, useState } from "react";
import {
  createRoom,
  deleteRoom,
  listRooms,
  syncAreas,
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

  const addRoom = useCallback(
    async (dto: CreateRoomDto): Promise<HaRoom> => {
      if (!instanceId) throw new Error("No instance");
      const room = await createRoom(instanceId, dto);
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

  const removeRoom = useCallback(
    async (roomId: string): Promise<void> => {
      if (!instanceId) throw new Error("No instance");
      await deleteRoom(instanceId, roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    },
    [instanceId],
  );

  const sync = useCallback(async (): Promise<SyncAreasResult> => {
    if (!instanceId) throw new Error("No instance");
    const result = await syncAreas(instanceId);
    await load();
    return result;
  }, [instanceId, load]);

  return {
    rooms,
    loading,
    error,
    reload: load,
    addRoom,
    editRoom,
    removeRoom,
    sync,
  };
}
