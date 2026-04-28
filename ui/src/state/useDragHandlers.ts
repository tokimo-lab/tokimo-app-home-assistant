/**
 * Extracts the tile-level and section-level DnD drag handlers from HomePage,
 * keeping the orchestration layer lean.
 */
import { type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCallback } from "react";
import { reorderRooms } from "../api/display";
import type { EntityState, HaRoom, UpdateEntityDisplayDto } from "../types";
import { FAVORITES_CONTAINER_ID } from "../components/home/FavoritesSection";
import { bySortOrder } from "../components/home/_helpers";

type PatchFn = (entityId: string, update: UpdateEntityDisplayDto) => Promise<unknown>;
type ReorderFavsFn = (items: { entity_id: string; favorite_order: number }[]) => Promise<unknown>;
type ReorderRoomEntsFn = (items: { entity_id: string; sort_order: number }[]) => Promise<unknown>;

export interface UseDragHandlersArgs {
  instanceId: string;
  entities: ReadonlyMap<string, EntityState>;
  favorites: EntityState[];
  entitiesByRoom: ReadonlyMap<string, EntityState[]>;
  rooms: HaRoom[];
  patch: PatchFn;
  reorderFavoritesOptimistic: ReorderFavsFn;
  reorderRoomEntitiesOptimistic: ReorderRoomEntsFn;
}

export function useDragHandlers({
  instanceId,
  entities,
  favorites,
  entitiesByRoom,
  rooms,
  patch,
  reorderFavoritesOptimistic,
  reorderRoomEntitiesOptimistic,
}: UseDragHandlersArgs) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const src = (active.data.current?.containerId as string | undefined) ?? null;
    const dst = (over.data.current?.containerId as string | undefined) ?? overId;
    if (!src || !dst || !entities.get(activeId)) return;

    if (src === dst) {
      if (activeId === overId) return;
      if (src === FAVORITES_CONTAINER_ID) {
        const list = [...favorites];
        const fi = list.findIndex((e) => e.entity_id === activeId);
        const ti = list.findIndex((e) => e.entity_id === overId);
        if (fi < 0 || ti < 0) return;
        const [mv] = list.splice(fi, 1);
        if (mv) list.splice(ti, 0, mv);
        void reorderFavoritesOptimistic(list.map((e, i) => ({ entity_id: e.entity_id, favorite_order: i })));
        return;
      }
      if (src.startsWith("room:")) {
        const list = (entitiesByRoom.get(src.slice(5)) ?? []).slice().sort(bySortOrder);
        const fi = list.findIndex((e) => e.entity_id === activeId);
        const ti = list.findIndex((e) => e.entity_id === overId);
        if (fi < 0 || ti < 0) return;
        const [mv] = list.splice(fi, 1);
        if (mv) list.splice(ti, 0, mv);
        void reorderRoomEntitiesOptimistic(list.map((e, i) => ({ entity_id: e.entity_id, sort_order: i })));
      }
      return;
    }
    if (dst === FAVORITES_CONTAINER_ID) { void patch(activeId, { is_favorite: true }); return; }
    if (src === FAVORITES_CONTAINER_ID) { void patch(activeId, { is_favorite: false }); return; }
    // Cross-room move: patch area_id.
    // TODO(H10/backend): also update explicit room_entities row; see original handleDragEnd comment.
    if (src.startsWith("room:") && dst.startsWith("room:")) {
      void patch(activeId, { area_id: dst.slice(5) });
    }
  }, [entities, favorites, entitiesByRoom, patch, reorderFavoritesOptimistic, reorderRoomEntitiesOptimistic]);

  const handleSectionDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const ordered = rooms.map((r) => r.id);
    const fi = ordered.indexOf(String(active.id));
    const ti = ordered.indexOf(String(over.id));
    if (fi < 0 || ti < 0 || fi === ti) return;
    const [mv] = ordered.splice(fi, 1);
    if (mv !== undefined) ordered.splice(ti, 0, mv);
    void reorderRooms(instanceId, ordered.map((id, i) => ({ room_id: id, sort_order: i })));
  }, [rooms, instanceId]);

  return { sensors, handleDragEnd, handleSectionDragEnd };
}
