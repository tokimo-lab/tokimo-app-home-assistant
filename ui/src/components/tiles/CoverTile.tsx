import { Blinds } from "lucide-react";
import { memo } from "react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBase } from "./TileBase";

function CoverTileImpl({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isOpen = state === "open";
  const gradient = getTileGradient("cover", state);
  const name = getFriendlyName(entity);
  const position = attributes.current_position;

  function toggle() {
    onCall({
      entity_id,
      domain: "cover",
      service: isOpen ? "close_cover" : "open_cover",
      target: { entity_id },
      optimisticState: isOpen ? "closed" : "open",
    });
  }

  const detail = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">
          {t("tilePosition")}
        </span>
        <span className="font-medium text-[var(--text-primary)]">
          {position ?? (isOpen ? 100 : 0)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position ?? (isOpen ? 100 : 0)}
        className="w-full cursor-pointer accent-sky-400"
        onChange={(e) => {
          const pos = Number(e.target.value);
          onCall({
            entity_id,
            domain: "cover",
            service: "set_cover_position",
            target: { entity_id },
            data: { position: pos },
            optimisticAttributes: { current_position: pos },
          });
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 cursor-pointer rounded-lg bg-white/10 py-2 text-sm text-white transition hover:bg-white/20"
          onClick={() =>
            onCall({
              entity_id,
              domain: "cover",
              service: "open_cover",
              target: { entity_id },
              optimisticState: "open",
              optimisticAttributes: { current_position: 100 },
            })
          }
        >
          {t("stateOpen")}
        </button>
        <button
          type="button"
          className="flex-1 cursor-pointer rounded-lg bg-white/10 py-2 text-sm text-white transition hover:bg-white/20"
          onClick={() =>
            onCall({
              entity_id,
              domain: "cover",
              service: "close_cover",
              target: { entity_id },
              optimisticState: "closed",
              optimisticAttributes: { current_position: 0 },
            })
          }
        >
          {t("stateClosed")}
        </button>
      </div>
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={toggle}
      detail={detail}
      detailTitle={name}
    >
      <Blinds size={20} className="text-white/80" />
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/70">
          {position != null
            ? `${position}%`
            : isOpen
              ? t("stateOpen")
              : t("stateClosed")}
        </p>
      </div>
    </TileBase>
  );
}

export const CoverTile = memo(CoverTileImpl, tilePropsEqual);
