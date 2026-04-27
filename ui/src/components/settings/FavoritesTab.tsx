import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { reorderFavorites, updateEntityDisplay } from "../../api/display";
import { getDomain } from "../../lib/domain";
import { getEntitiesSnapshot, subscribeRender } from "../../state/entityStore";
import type { EntityState, FavoriteReorderItem } from "../../types";
import { EntityIcon } from "../EntityIcon";
import { SortableList, SortableRow } from "./SortableRow";

interface FavoritesTabProps {
  instanceId: string;
  t: (k: string) => string;
}

function entityLabel(e: EntityState): string {
  return e.display_name ?? e.attributes.friendly_name ?? e.entity_id;
}

export function FavoritesTab({ instanceId, t }: FavoritesTabProps) {
  // Read from the shared entity store (parent already opened the SSE stream).
  const entities = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  const favorites = useMemo(() => {
    const list = Array.from(entities.values()).filter((e) => e.is_favorite);
    list.sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0));
    return list;
  }, [entities]);

  // Local optimistic ordering by entity_id.
  const [orderIds, setOrderIds] = useState<string[]>([]);
  useEffect(() => {
    setOrderIds(favorites.map((e) => e.entity_id));
  }, [favorites]);

  const orderedFavorites = useMemo(() => {
    const byId = new Map(favorites.map((e) => [e.entity_id, e]));
    const out: EntityState[] = [];
    for (const id of orderIds) {
      const e = byId.get(id);
      if (e) out.push(e);
    }
    for (const e of favorites) {
      if (!orderIds.includes(e.entity_id)) out.push(e);
    }
    return out;
  }, [orderIds, favorites]);

  async function commitOrder(newIds: string[]) {
    setOrderIds(newIds);
    const items: FavoriteReorderItem[] = newIds.map((id, i) => ({
      entity_id: id,
      favorite_order: i,
    }));
    try {
      await reorderFavorites(instanceId, items);
    } catch (e) {
      console.warn("[ha:favorites] reorder failed", e);
    }
  }

  function move(idx: number, dir: -1 | 1) {
    const next = orderedFavorites.slice().map((e) => e.entity_id);
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    void commitOrder(next);
  }

  async function unfavorite(entityId: string) {
    setOrderIds((prev) => prev.filter((id) => id !== entityId));
    try {
      await updateEntityDisplay(instanceId, entityId, { is_favorite: false });
    } catch (e) {
      console.warn("[ha:favorites] unfavorite failed", e);
    }
  }

  if (orderedFavorites.length === 0) {
    return (
      <p className="text-sm text-white/60">{t("settingsFavoritesEmpty")}</p>
    );
  }

  return (
    <SortableList
      items={orderedFavorites.map((e) => ({ id: e.entity_id, entity: e }))}
      onReorder={(ids) => void commitOrder(ids)}
      renderRow={(item) => {
        const idx = orderedFavorites.findIndex((e) => e.entity_id === item.id);
        const e = item.entity;
        return (
          <SortableRow
            key={item.id}
            id={item.id}
            isFirst={idx === 0}
            isLast={idx === orderedFavorites.length - 1}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
          >
            <EntityIcon
              domain={getDomain(e.entity_id)}
              state={e.state}
              size={16}
              className="shrink-0 text-white/70"
            />
            <span className="truncate">{entityLabel(e)}</span>
            <span className="shrink-0 text-xs text-white/30">
              {e.entity_id}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              aria-label={t("settingsRemoveFavorite")}
              title={t("settingsRemoveFavorite")}
              onClick={() => void unfavorite(item.id)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-white/50 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </SortableRow>
        );
      }}
    />
  );
}
