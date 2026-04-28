import { Sparkles } from "lucide-react";
import type { DomainDetailProps } from "./_types";

export function SceneDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id } = entity;

  const trigger = () => {
    onCall({
      entity_id,
      domain: "scene",
      service: "turn_on",
      target: { entity_id },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <button
        type="button"
        onClick={trigger}
        aria-label={t("detailSceneActivate")}
        className="flex h-40 w-40 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400 text-white shadow-lg transition hover:brightness-110 active:scale-95"
      >
        <Sparkles size={64} strokeWidth={1.5} />
      </button>
      <p className="font-medium text-base text-zinc-900 dark:text-zinc-100">
        {t("detailSceneTapToActivate")}
      </p>
    </div>
  );
}
