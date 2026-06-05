import { Lock, Unlock } from "lucide-react";
import type { DomainDetailProps } from "./_types";

export function LockDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state } = entity;
  const isLocked = state === "locked";

  const toggle = () => {
    onCall({
      entity_id,
      domain: "lock",
      service: isLocked ? "unlock" : "lock",
      target: { entity_id },
      optimisticState: isLocked ? "unlocked" : "locked",
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isLocked}
        aria-label={isLocked ? t("detailLockUnlock") : t("detailLockLock")}
        className={`flex h-40 w-40 cursor-pointer items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
          isLocked
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "bg-rose-500 text-white hover:bg-rose-600"
        }`}
      >
        {isLocked ? (
          <Lock size={64} strokeWidth={1.5} />
        ) : (
          <Unlock size={64} strokeWidth={1.5} />
        )}
      </button>
      <p className="font-medium text-base text-fg-primary">
        {isLocked ? t("stateLocked") : t("stateUnlocked")}
      </p>
    </div>
  );
}
