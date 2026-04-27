import type {
  CreateRoomDto,
  HaRoom,
  SyncAreasResult,
  UpdateRoomDto,
} from "../types";
import { apiFetch } from "./client";

export function listRooms(instanceId: string): Promise<HaRoom[]> {
  return apiFetch(`/instances/${encodeURIComponent(instanceId)}/rooms`);
}

export function createRoom(
  instanceId: string,
  dto: CreateRoomDto,
): Promise<HaRoom> {
  return apiFetch(`/instances/${encodeURIComponent(instanceId)}/rooms`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function updateRoom(
  instanceId: string,
  roomId: string,
  dto: UpdateRoomDto,
): Promise<HaRoom> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/${encodeURIComponent(roomId)}`,
    { method: "PATCH", body: JSON.stringify(dto) },
  );
}

export function deleteRoom(instanceId: string, roomId: string): Promise<void> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/${encodeURIComponent(roomId)}`,
    { method: "DELETE" },
  );
}

export function syncAreas(instanceId: string): Promise<SyncAreasResult> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/sync_areas`,
    { method: "POST" },
  );
}

export function addEntityToRoom(
  instanceId: string,
  roomId: string,
  entityId: string,
): Promise<HaRoom> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/${encodeURIComponent(roomId)}/entities`,
    { method: "POST", body: JSON.stringify({ entity_id: entityId }) },
  );
}

export function removeEntityFromRoom(
  instanceId: string,
  roomId: string,
  entityId: string,
): Promise<void> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/${encodeURIComponent(roomId)}/entities/${encodeURIComponent(entityId)}`,
    { method: "DELETE" },
  );
}
