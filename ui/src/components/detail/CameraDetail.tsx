import { CameraOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DomainDetailProps } from "./_types";

type LoadState = "loading" | "loaded" | "error";

export function CameraDetail({ entity, t }: DomainDetailProps) {
  const { attributes } = entity;
  const src =
    typeof attributes.entity_picture === "string"
      ? attributes.entity_picture
      : "";

  const [status, setStatus] = useState<LoadState>(src ? "loading" : "error");

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  return (
    <div className="flex flex-col items-stretch gap-3 py-2">
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-raised">
        {src && (
          <img
            src={src}
            alt={t("detailCameraPreview")}
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            draggable={false}
          />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-fg-muted">
            <Loader2 size={32} className="motion-safe:animate-spin" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-muted">
            <CameraOff size={32} />
            <p className="text-sm">{t("detailCameraUnavailable")}</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-fg-secondary">
        {t("detailCameraSnapshotNote")}
      </p>
    </div>
  );
}
