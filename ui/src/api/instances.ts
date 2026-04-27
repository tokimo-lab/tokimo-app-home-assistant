import type {
  CreateInstanceDto,
  HaInstance,
  TestResult,
  UpdateInstanceDto,
} from "../types";
import { apiFetch } from "./client";

export function listInstances(): Promise<HaInstance[]> {
  return apiFetch("/instances");
}

export function createInstance(dto: CreateInstanceDto): Promise<HaInstance> {
  return apiFetch("/instances", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function updateInstance(
  id: string,
  dto: UpdateInstanceDto,
): Promise<HaInstance> {
  return apiFetch(`/instances/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export function deleteInstance(id: string): Promise<void> {
  return apiFetch(`/instances/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function testInstance(id: string): Promise<TestResult> {
  return apiFetch(`/instances/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}
