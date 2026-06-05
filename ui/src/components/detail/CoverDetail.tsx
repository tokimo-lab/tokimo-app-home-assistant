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
        trackClassName="bg-surface-raised"
        ariaLabel={t("detailCoverPosition")}
      >
        <span className="font-semibold text-2xl text-fg-primary">
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
          className="cursor-pointer rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-fg-primary transition hover:bg-surface-raised"
        >
          {t("detailCoverOpen")}
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
          className="cursor-pointer rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-fg-primary transition hover:bg-surface-raised"
        >
          {t("detailCoverClose")}
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
          className="cursor-pointer rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-fg-primary transition hover:bg-surface-raised"
        >
          {t("detailCoverStop")}
        </button>
      </div>
    </div>
  );
}
