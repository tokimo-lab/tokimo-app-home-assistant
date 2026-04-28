import { useEffect, useState } from "react";
import { VerticalSlider } from "./_helpers/VerticalSlider";
import type { DomainDetailProps } from "./_types";

export function CoverDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, attributes } = entity;
  const externalPos =
    typeof attributes.current_position === "number"
      ? attributes.current_position
      : entity.state === "open"
        ? 100
        : 0;

  const [pos, setPos] = useState(externalPos);

  useEffect(() => {
    setPos(externalPos);
  }, [externalPos]);

  const commit = (value: number) => {
    onCall({
      entity_id,
      domain: "cover",
      service: "set_cover_position",
      target: { entity_id },
      data: { position: value },
      optimisticState: value > 0 ? "open" : "closed",
      optimisticAttributes: { current_position: value },
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <VerticalSlider
        value={pos}
        min={0}
        max={100}
        onChange={setPos}
        onChangeEnd={commit}
        fillClassName="bg-gradient-to-t from-sky-500 to-sky-400"
        trackClassName="bg-zinc-200 dark:bg-zinc-800"
        ariaLabel={t("ha.detail.cover.position")}
      >
        <span className="font-semibold text-2xl text-zinc-900 dark:text-zinc-100">
          {pos}%
        </span>
      </VerticalSlider>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onCall({
              entity_id,
              domain: "cover",
              service: "open_cover",
              target: { entity_id },
              optimisticState: "opening",
            })
          }
          className="cursor-pointer rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          {t("ha.detail.cover.open")}
        </button>
        <button
          type="button"
          onClick={() =>
            onCall({
              entity_id,
              domain: "cover",
              service: "close_cover",
              target: { entity_id },
              optimisticState: "closing",
            })
          }
          className="cursor-pointer rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          {t("ha.detail.cover.close")}
        </button>
        <button
          type="button"
          onClick={() =>
            onCall({
              entity_id,
              domain: "cover",
              service: "stop_cover",
              target: { entity_id },
            })
          }
          className="cursor-pointer rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          {t("ha.detail.cover.stop")}
        </button>
      </div>
    </div>
  );
}
