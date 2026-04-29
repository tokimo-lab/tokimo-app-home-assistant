import { Camera, Maximize2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { getFriendlyName } from "../../lib/format";
import { useDetailOverlay } from "../../state/useDetailOverlay";
import { type TileProps, tilePropsEqual } from "./_types";
import { TileBaseStyle } from "./TileBaseStyle";

const REFRESH_INTERVAL = 10_000;

function buildProxyUrl(instanceId: string, entityId: string): string {
  return `/api/apps/home-assistant/instances/${encodeURIComponent(instanceId)}/camera_proxy/${encodeURIComponent(entityId)}`;
}

function CameraTileImpl({ entity, instanceId, t, size }: TileProps) {
  const { entity_id } = entity;
  const name = getFriendlyName(entity);
  const [imgSrc, setImgSrc] = useState<string>(() =>
    buildProxyUrl(instanceId, entity_id),
  );
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { openDetail } = useDetailOverlay();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const id = setInterval(() => {
      setImgSrc(`${buildProxyUrl(instanceId, entity_id)}?t=${Date.now()}`);
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [isVisible, instanceId, entity_id]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <TileBaseStyle
        domain="camera"
        isOn
        size={size}
        icon={<Camera size={28} />}
        name={name}
        stateText={t("stateOn")}
        onClick={() => openDetail(entity_id, instanceId)}
        onLongPress={() => openDetail(entity_id, instanceId)}
      >
        <img
          src={imgSrc}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          onError={() => {}}
        />
        <div className="absolute inset-0 bg-black/40" />
        <Maximize2
          size={14}
          className="absolute right-2 top-2 z-10 text-white/70"
        />
      </TileBaseStyle>
    </div>
  );
}

export const CameraTile = memo(CameraTileImpl, tilePropsEqual);
