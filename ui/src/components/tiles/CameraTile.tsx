import { Camera, Maximize2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFriendlyName } from "../../lib/format";
import type { TileProps } from "./_types";
import { TileBase } from "./TileBase";

const REFRESH_INTERVAL = 10_000;

function buildProxyUrl(instanceId: string, entityId: string): string {
  return `/api/apps/home-assistant/instances/${encodeURIComponent(instanceId)}/camera_proxy/${encodeURIComponent(entityId)}`;
}

export function CameraTile({ entity, instanceId, t: _t }: TileProps) {
  const { entity_id } = entity;
  const name = getFriendlyName(entity);
  const [imgSrc, setImgSrc] = useState<string>(() =>
    buildProxyUrl(instanceId, entity_id),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setImgSrc(`${buildProxyUrl(instanceId, entity_id)}?t=${Date.now()}`);
    }, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [instanceId, entity_id]);

  const gradient = "linear-gradient(135deg, #1f2937 0%, #111827 100%)";

  return (
    <>
      <TileBase gradient={gradient} onClick={() => setFullscreen(true)}>
        <div className="absolute inset-0 overflow-hidden rounded-[22px]">
          <img
            src={imgSrc}
            alt={name}
            className="h-full w-full object-cover opacity-60"
            onError={() => {}}
          />
        </div>
        <div className="relative z-10 flex items-start justify-between">
          <Camera size={16} className="text-white/80" />
          <Maximize2 size={14} className="text-white/60" />
        </div>
        <div className="relative z-10">
          <p className="truncate text-xs font-semibold text-white drop-shadow">
            {name}
          </p>
        </div>
      </TileBase>

      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
            <img
              src={imgSrc}
              alt={name}
              className="max-h-full max-w-full object-contain"
            />
            <button
              type="button"
              className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Close fullscreen"
              onClick={() => setFullscreen(false)}
            >
              ✕
            </button>
            <button
              type="button"
              className="absolute bottom-4 right-4 cursor-pointer rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Refresh"
              onClick={() => {
                setImgSrc(
                  `${buildProxyUrl(instanceId, entity_id)}?t=${Date.now()}`,
                );
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
