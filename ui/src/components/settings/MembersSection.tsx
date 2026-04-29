import { cn } from "@tokimo/ui";
import { Crown, Eye, EyeOff, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/client";
import { updateEntityDisplay } from "../../api/display";
import { useEntityAccessory } from "../../state/useAccessories";
import type { EntityState } from "../../types";
import { AddMemberModal } from "./AddMemberModal";

interface MembersSectionProps {
  entity: EntityState;
  instanceId: string;
  t: (k: string) => string;
  onRefresh: () => Promise<void>;
}

export function MembersSection({
  entity,
  instanceId,
  t,
  onRefresh,
}: MembersSectionProps) {
  const accessory = useEntityAccessory(entity.entity_id);
  const [modalOpen, setModalOpen] = useState(false);
  const [operating, setOperating] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#members") {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, []);

  if (!accessory) return null;

  async function setPrimary(entityId: string) {
    setOperating(entityId);
    try {
      await updateEntityDisplay(instanceId, entityId, { group_primary: true });
      await onRefresh();
    } catch (e) {
      console.error("Failed to set primary:", e);
    } finally {
      setOperating(null);
    }
  }

  async function toggleHidden(member: EntityState) {
    setOperating(member.entity_id);
    try {
      const nextRole =
        member.sub_function_role === "hidden_in_aggregate"
          ? null
          : "hidden_in_aggregate";
      await updateEntityDisplay(instanceId, member.entity_id, {
        sub_function_role: nextRole,
      });
      await onRefresh();
    } catch (e) {
      console.error("Failed to toggle hidden:", e);
    } finally {
      setOperating(null);
    }
  }

  async function removeMember(entityId: string) {
    setOperating(entityId);
    try {
      await apiFetch(
        `/instances/${instanceId}/accessories/${accessory.groupId}/members/${entityId}`,
        { method: "DELETE" },
      );
      await onRefresh();
    } catch (e) {
      console.error("Failed to remove member:", e);
    } finally {
      setOperating(null);
    }
  }

  return (
    <div ref={sectionRef} className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[11px] font-medium uppercase tracking-wider text-white/40 dark:text-white/40">
        {t("accessoryMembers")}
      </h3>

      <div className="flex flex-col gap-1">
        {accessory.members.map((member) => {
          const isPrimary = member.group_primary === true;
          const isHidden = member.sub_function_role === "hidden_in_aggregate";
          const isPromoted = member.sub_function_role === "promoted_to_tile";
          const isOperating = operating === member.entity_id;

          return (
            <div
              key={member.entity_id}
              className={cn(
                "flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2 transition",
                isOperating && "opacity-50",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm">
                {member.custom_icon ?? member.attributes.icon ?? "💡"}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-white">
                  {member.attributes.friendly_name ?? member.entity_id}
                </span>
                <span className="truncate text-xs text-white/40">
                  {member.entity_id}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isPrimary && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                    <Crown size={10} />
                    {t("accessoryPrimaryBadge")}
                  </span>
                )}
                {isHidden && (
                  <span className="flex items-center gap-1 rounded-full bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-300">
                    <EyeOff size={10} />
                    {t("accessoryHiddenBadge")}
                  </span>
                )}
                {isPromoted && (
                  <span className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
                    <TrendingUp size={10} />
                    {t("accessoryPromotedBadge")}
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {!isPrimary && (
                    <button
                      type="button"
                      onClick={() =>
                        !isOperating && setPrimary(member.entity_id)
                      }
                      disabled={isOperating}
                      title={t("accessorySetAsPrimary")}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-white/50 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Crown size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => !isOperating && toggleHidden(member)}
                    disabled={isOperating}
                    title={
                      isHidden
                        ? t("accessoryShowInDetail")
                        : t("accessoryHideInDetail")
                    }
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-white/50 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      !isOperating && removeMember(member.entity_id)
                    }
                    disabled={isOperating}
                    title={t("accessoryRemoveFromAccessory")}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mt-1 cursor-pointer rounded-lg border border-dashed border-white/20 px-3 py-2 text-center text-sm text-white/70 transition hover:border-white/30 hover:bg-white/[0.02] hover:text-white"
      >
        + {t("accessoryAddMember")}
      </button>

      <AddMemberModal
        open={modalOpen}
        instanceId={instanceId}
        groupId={accessory.groupId}
        currentMembers={accessory.members}
        t={t}
        onClose={() => setModalOpen(false)}
        onAdded={onRefresh}
      />
    </div>
  );
}
