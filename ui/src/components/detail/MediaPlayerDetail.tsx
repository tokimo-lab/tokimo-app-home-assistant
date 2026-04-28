import {
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { HorizontalSlider } from "./_helpers/HorizontalSlider";
import type { DomainDetailProps } from "./_types";

const PLAYING_STATES = new Set(["playing", "buffering"]);

export function MediaPlayerDetail({ entity, onCall, t }: DomainDetailProps) {
  const { entity_id, state, attributes } = entity;
  const isPlaying = PLAYING_STATES.has(state);
  const isOff =
    state === "off" || state === "standby" || state === "unavailable";

  const title =
    typeof attributes.media_title === "string" ? attributes.media_title : "";
  const artist =
    typeof attributes.media_artist === "string" ? attributes.media_artist : "";
  const album =
    typeof attributes.media_album_name === "string"
      ? attributes.media_album_name
      : "";
  const artwork =
    typeof attributes.entity_picture === "string"
      ? attributes.entity_picture
      : "";
  const deviceClass =
    typeof attributes.device_class === "string" ? attributes.device_class : "";
  const muted = attributes.is_volume_muted === true;
  const externalVolume =
    typeof attributes.volume_level === "number"
      ? Math.round(attributes.volume_level * 100)
      : 0;

  const [volume, setVolume] = useState(externalVolume);

  useEffect(() => {
    setVolume(externalVolume);
  }, [externalVolume]);

  const call = (service: string, data?: Record<string, unknown>) => {
    onCall({
      entity_id,
      domain: "media_player",
      service,
      target: { entity_id },
      data,
    });
  };

  const togglePlay = () => {
    call(isPlaying ? "media_pause" : "media_play");
  };

  const commitVolume = (value: number) => {
    call("volume_set", { volume_level: value / 100 });
  };

  const toggleMute = () => {
    call("volume_mute", { is_volume_muted: !muted });
  };

  return (
    <div className="flex flex-col items-stretch gap-6 py-2">
      {/* Now playing */}
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 shadow-inner dark:bg-zinc-800">
          {artwork ? (
            <img
              src={artwork}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <Play size={28} className="text-zinc-400 dark:text-zinc-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-base text-zinc-900 dark:text-zinc-100">
            {title || t("detailMediaPlayerNothingPlaying")}
          </p>
          {artist && (
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {artist}
            </p>
          )}
          {album && (
            <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
              {album}
            </p>
          )}
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => call("media_previous_track")}
          disabled={isOff}
          aria-label={t("detailMediaPlayerPrevious")}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <SkipBack size={20} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={isOff}
          aria-pressed={isPlaying}
          aria-label={
            isPlaying
              ? t("detailMediaPlayerPause")
              : t("detailMediaPlayerPlay")
          }
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-white shadow-lg transition hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? (
            <Pause size={28} fill="currentColor" />
          ) : (
            <Play size={28} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          onClick={() => call("media_next_track")}
          disabled={isOff}
          aria-label={t("detailMediaPlayerNext")}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <SkipForward size={20} />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleMute}
          disabled={isOff}
          aria-pressed={muted}
          aria-label={
            muted
              ? t("detailMediaPlayerUnmute")
              : t("detailMediaPlayerMute")
          }
          className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <HorizontalSlider
          value={volume}
          min={0}
          max={100}
          disabled={isOff}
          onChange={setVolume}
          onChangeEnd={commitVolume}
          ariaLabel={t("detailMediaPlayerVolume")}
          fillClassName="bg-amber-400"
          trackClassName="bg-zinc-200 dark:bg-zinc-800"
          heightClassName="h-2"
        />
        <span className="w-10 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {volume}%
        </span>
      </div>

      {/* Apple TV jump-out */}
      {deviceClass === "tv" && (
        <button
          type="button"
          onClick={() => call("select_source", { source: "Apple TV" })}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 font-medium text-sm text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <ExternalLink size={16} />
          {t("detailMediaPlayerOpenAppleTv")}
        </button>
      )}
    </div>
  );
}
