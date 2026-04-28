import { Camera, Maximize2, RefreshCw } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFriendlyName } from "../../lib/format";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBase } from "./TileBase";

const REFRESH_INTERVAL = 10_000;

function buildProxyUrl(instanceId: string, entityId: string): string {
  return `/api/apps/home-assistant/instances/${encodeURIComponent(instanceId)}/camera_proxy/${encodeURIComponent(entityId)}`;
}

function CameraTileImpl({ entity, instanceId, t }: TileProps) {
  const { entity_id } = entity;
  const name = getFriendlyName(entity);
  const [imgSrc, setImgSrc] = useState<string>(() =>
    buildProxyUrl(instanceId, entity_id),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible && !fullscreen) return;
    const id = setInterval(() => {
      setImgSrc(`${buildProxyUrl(instanceId, entity_id)}?t=${Date.now()}`);
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [isVisible, fullscreen, instanceId, entity_id]);

  const gradient = "linear-gradient(135deg, #1f2937 0%, #111827 100%)";

  return (
    <>
      <div ref={tileRef}>
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
      </div>

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
              aria-label={t("cameraCloseFullscreen")}
              onClick={() => setFullscreen(false)}
            >
              ✕
            </button>
            <button
              type="button"
              className="absolute bottom-4 right-4 cursor-pointer rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label={t("cameraRefresh")}
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

export const CameraTile = memo(CameraTileImpl, tilePropsEqual);
