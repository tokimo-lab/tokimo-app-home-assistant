import type { InstanceSummary } from "../types/summary";
import { apiFetch } from "./client";

export function getInstanceSummary(
  instanceId: string,
): Promise<InstanceSummary> {
  return apiFetch(`/instances/${encodeURIComponent(instanceId)}/summary`);
}
