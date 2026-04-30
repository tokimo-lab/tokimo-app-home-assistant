/**
 * Accessory (tile) endpoints — see backend `apps/tokimo-app-home-assistant/src/handlers/accessories.rs`.
 *
 * Routes:
 *   GET    /instances/:id/accessories           → AccessoryGroup[]
 *   POST   /instances/:id/accessories           → manual group create
 *   GET    /accessories/:gid/entities           → EntityState[] (joined live state)
 *   GET    /accessories/:gid/members            → AccessoryMember[]
 *   POST   /accessories/:gid/members            → AccessoryMember (append)
 *   PATCH  /accessories/:gid/members/:entity_id → is_primary / sub_function_role / sort_order
 *   DELETE /accessories/:gid/members/:entity_id → 204
 */
import type {
  AccessoryGroup,
  AccessoryMember,
  EntityState,
} from "../types";
import { apiFetch } from "./client";

export function listAccessories(
  instanceId: string,
): Promise<AccessoryGroup[]> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/accessories`,
  );
}

export interface CreateManualGroupBody {
  natural_key: string;
  display_name?: string | null;
  custom_icon?: string | null;
  member_entity_ids?: string[];
}

export interface CreateManualGroupResponse {
  group: AccessoryGroup;
  members: AccessoryMember[];
}

export function createManualGroup(
  instanceId: string,
  body: CreateManualGroupBody,
): Promise<CreateManualGroupResponse> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/accessories`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getAccessoryEntities(
  groupId: string,
): Promise<EntityState[]> {
  return apiFetch(
    `/accessories/${encodeURIComponent(groupId)}/entities`,
  );
}

export function getAccessoryMembers(
  groupId: string,
): Promise<AccessoryMember[]> {
  return apiFetch(
    `/accessories/${encodeURIComponent(groupId)}/members`,
  );
}

export interface AddMemberBody {
  entity_id: string;
  /** Defaults to false; backend auto-promotes when this is the first member. */
  is_primary?: boolean;
  sub_function_role?: "hidden_in_aggregate" | "promoted_to_tile" | null;
  sort_order?: number;
}

export function addMember(
  groupId: string,
  body: AddMemberBody,
): Promise<AccessoryMember> {
  return apiFetch(
    `/accessories/${encodeURIComponent(groupId)}/members`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export interface PatchMemberBody {
  /**
   * Only `true` is honored. Setting `false` is rejected — to elect a new
   * primary, PATCH another member with `is_primary: true` and the backend
   * demotes the previous primary in the same transaction.
   */
  is_primary?: true;
  /**
   * `string` sets the role, `null` clears it, omitted leaves unchanged.
   */
  sub_function_role?: "hidden_in_aggregate" | "promoted_to_tile" | null;
  sort_order?: number;
}

export function updateMember(
  groupId: string,
  entityId: string,
  patch: PatchMemberBody,
): Promise<AccessoryMember> {
  return apiFetch(
    `/accessories/${encodeURIComponent(groupId)}/members/${encodeURIComponent(entityId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function removeMember(
  groupId: string,
  entityId: string,
): Promise<void> {
  return apiFetch(
    `/accessories/${encodeURIComponent(groupId)}/members/${encodeURIComponent(entityId)}`,
    { method: "DELETE" },
  );
}
