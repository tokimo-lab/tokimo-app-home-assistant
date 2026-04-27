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
  _instanceId: string,
  roomId: string,
  dto: UpdateRoomDto,
): Promise<HaRoom> {
  return apiFetch(`/rooms/${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export function deleteRoom(_instanceId: string, roomId: string): Promise<void> {
  return apiFetch(`/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  });
}

export function syncAreas(instanceId: string): Promise<SyncAreasResult> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/sync_areas`,
    { method: "POST" },
  );
}

interface AddEntityResp {
  room_id: string;
  entity_id: string;
  sort_order: number;
}

export function addEntityToRoom(
  _instanceId: string,
  roomId: string,
  entityId: string,
): Promise<AddEntityResp> {
  return apiFetch(`/rooms/${encodeURIComponent(roomId)}/entities`, {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId }),
  });
}

export function removeEntityFromRoom(
  _instanceId: string,
  roomId: string,
  entityId: string,
): Promise<void> {
  return apiFetch(
    `/rooms/${encodeURIComponent(roomId)}/entities/${encodeURIComponent(entityId)}`,
    { method: "DELETE" },
  );
}
