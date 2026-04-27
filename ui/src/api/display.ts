import type {
  EntityDisplay,
  FavoriteReorderItem,
  ReorderResult,
  RoomReorderItem,
  UpdateEntityDisplayDto,
} from "../types";
import { apiFetch } from "./client";

export function updateEntityDisplay(
  instanceId: string,
  entityId: string,
  patch: UpdateEntityDisplayDto,
): Promise<EntityDisplay> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/entities/${encodeURIComponent(entityId)}/display`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function reorderRooms(
  instanceId: string,
  items: RoomReorderItem[],
): Promise<ReorderResult> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/rooms/reorder`,
    { method: "PATCH", body: JSON.stringify(items) },
  );
}

export function reorderFavorites(
  instanceId: string,
  items: FavoriteReorderItem[],
): Promise<ReorderResult> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/favorites/reorder`,
    { method: "PATCH", body: JSON.stringify(items) },
  );
}
