import type {
  EntityAttributes,
  EntityOverride,
  EntityState,
  ServiceCallBody,
  ServiceResult,
} from "../types";
import { apiFetch } from "./client";

export function listEntities(instanceId: string): Promise<EntityState[]> {
  return apiFetch(`/instances/${encodeURIComponent(instanceId)}/entities`);
}

export function callService(
  instanceId: string,
  domain: string,
  service: string,
  body: ServiceCallBody,
): Promise<ServiceResult> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function overrideEntity(
  instanceId: string,
  entityId: string,
  override: Partial<EntityOverride>,
): Promise<EntityState> {
  return apiFetch(
    `/instances/${encodeURIComponent(instanceId)}/entities/${encodeURIComponent(entityId)}/override`,
    { method: "PATCH", body: JSON.stringify(override) },
  );
}

// Type-only re-export for convenience
export type { EntityAttributes, EntityState };
