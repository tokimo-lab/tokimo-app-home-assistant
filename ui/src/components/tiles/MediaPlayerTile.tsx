import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import { getTileGradient } from "../../lib/colors";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

export function MediaPlayerTile({ entity, t, onCall }: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isPlaying = state === "playing";
  const gradient = getTileGradient("media_player", state);
  const name = getFriendlyName(entity);
  const mediaTitle =
    attributes.media_title ?? (isPlaying ? t("statePlaying") : state);
  const volume = (attributes.volume_level ?? 0) * 100;
  const isMuted = attributes.is_volume_muted ?? false;

  function playPause() {
    onCall({
      entity_id,
      domain: "media_player",
      service: isPlaying ? "media_pause" : "media_play",
      target: { entity_id },
      optimisticState: isPlaying ? "paused" : "playing",
    });
  }

  const detail = (
    <div className="flex flex-col gap-4">
      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
        {mediaTitle}
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          className="cursor-pointer rounded-full p-2 hover:bg-white/10 text-white"
          onClick={playPause}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-full p-2 hover:bg-white/10 text-white/70"
          onClick={() =>
            onCall({
              entity_id,
              domain: "media_player",
              service: "media_next_track",
              target: { entity_id },
            })
          }
        >
          <SkipForward size={18} />
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-full p-2 hover:bg-white/10 text-white/70"
          onClick={() =>
            onCall({
              entity_id,
              domain: "media_player",
              service: "volume_mute",
              target: { entity_id },
              data: { is_volume_muted: !isMuted },
              optimisticAttributes: { is_volume_muted: !isMuted },
            })
          }
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">
          {t("tileVolume")}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume)}
          className="w-full cursor-pointer accent-violet-400"
          onChange={(e) => {
            const vol = Number(e.target.value) / 100;
            onCall({
              entity_id,
              domain: "media_player",
              service: "volume_set",
              target: { entity_id },
              data: { volume_level: vol },
              optimisticAttributes: { volume_level: vol },
            });
          }}
        />
      </div>
    </div>
  );

  return (
    <TileBase
      gradient={gradient}
      onClick={playPause}
      detail={detail}
      detailTitle={name}
    >
      <div className="flex items-center justify-between">
        {isPlaying ? (
          <Pause size={18} className="text-white/80" />
        ) : (
          <Play size={18} className="text-white/80" />
        )}
      </div>
      <div>
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="truncate text-xs text-white/70">{mediaTitle}</p>
      </div>
    </TileBase>
  );
}
