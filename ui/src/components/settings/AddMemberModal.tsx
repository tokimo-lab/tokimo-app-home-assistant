import { cn, Modal } from "@tokimo/ui";
import { Search } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import * as accessoriesApi from "../../api/accessories";
import { getEntitiesSnapshot, subscribeRender } from "../../state/entityStore";
import { useAccessoriesSnapshot } from "../../state/useAccessories";
import type { EntityState } from "../../types";

interface AddMemberModalProps {
  open: boolean;
  instanceId: string;
  groupId: string;
  currentMembers: EntityState[];
  t: (k: string) => string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddMemberModal({
  open,
  instanceId,
  groupId,
  currentMembers,
  t,
  onClose,
  onAdded,
}: AddMemberModalProps) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(
    subscribeRender,
    getEntitiesSnapshot,
    getEntitiesSnapshot,
  );

  const { entityToGroups } = useAccessoriesSnapshot(instanceId);

  const allEntities = useMemo(() => Array.from(snapshot.values()), [snapshot]);

  const currentMemberIds = useMemo(
    () => new Set(currentMembers.map((e) => e.entity_id)),
    [currentMembers],
  );

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();
    return allEntities
      .filter((e) => {
        if (currentMemberIds.has(e.entity_id)) return false;
        if (!lowerSearch) return true;
        const friendlyName = e.attributes.friendly_name ?? e.entity_id;
        return (
          friendlyName.toLowerCase().includes(lowerSearch) ||
          e.entity_id.toLowerCase().includes(lowerSearch)
        );
      })
      .sort((a, b) => {
        const aName = a.attributes.friendly_name ?? a.entity_id;
        const bName = b.attributes.friendly_name ?? b.entity_id;
        return aName.localeCompare(bName);
      });
  }, [allEntities, currentMemberIds, search]);

  async function addMember(entityId: string) {
    setAdding(entityId);
    try {
      await accessoriesApi.addMember(groupId, { entity_id: entityId });
      onAdded();
      onClose();
    } catch (e) {
      console.error("Failed to add member:", e);
      setAdding(null);
    }
  }

  return (
    <Modal
      open={open}
      title={t("addMemberModalTitle")}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("addMemberModalSearch")}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 pl-9 text-sm text-white placeholder:text-white/40 focus:border-blue-500/50 focus:outline-none"
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-white/50">
              {search
                ? t("addMemberModalNoResults")
                : t("addMemberModalLoading")}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {filtered.map((entity) => {
              const isAdding = adding === entity.entity_id;
              // M:N: an entity can belong to several groups simultaneously.
              // Adding it here is *append*, not move — surface that the
              // entity already lives in another accessory so the user knows
              // they're creating a multi-membership.
              const otherGroups = entityToGroups.get(entity.entity_id) ?? [];
              const hasOtherGroup = otherGroups.some((g) => g !== groupId);
              return (
                <button
                  key={entity.entity_id}
                  type="button"
                  onClick={() => !isAdding && addMember(entity.entity_id)}
                  disabled={isAdding}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition",
                    isAdding
                      ? "cursor-wait bg-white/[0.02] opacity-50"
                      : "hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm">
                    {entity.custom_icon ?? entity.attributes.icon ?? "💡"}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-white">
                      {entity.attributes.friendly_name ?? entity.entity_id}
                    </span>
                    <span className="truncate text-xs text-white/40">
                      {entity.entity_id}
                    </span>
                  </div>
                  {hasOtherGroup && (
                    <span className="shrink-0 text-xs text-amber-400/70">
                      {t("addMemberModalAlreadyInOtherAccessory")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
