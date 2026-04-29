import { Pause, Play } from "lucide-react";
import { memo } from "react";
import { getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

function MediaPlayerTileImpl({
  entity,
  instanceId,
  t,
  onCall,
  size,
}: TileProps) {
  const { entity_id, state, attributes } = entity;
  const isPlaying = state === "playing";
  const name = getFriendlyName(entity);
  const mediaTitle =
    attributes.media_title ?? (isPlaying ? t("statePlaying") : state);
  const { openDetail } = useDetailOverlay();

  function playPause() {
    onCall({
      entity_id,
      domain: "media_player",
      service: isPlaying ? "media_pause" : "media_play",
      target: { entity_id },
      optimisticState: isPlaying ? "paused" : "playing",
    });
  }

  return (
    <TileBaseStyle
      domain="media_player"
      size={size}
      isOn={isPlaying}
      icon={isPlaying ? <Pause size={18} /> : <Play size={18} />}
      name={name}
      stateText={mediaTitle}
      onClick={() => openDetail(entity_id, instanceId)}
      onIconClick={playPause}
      onLongPress={() => openDetail(entity_id, instanceId)}
    />
  );
}

export const MediaPlayerTile = memo(MediaPlayerTileImpl, tilePropsEqual);
