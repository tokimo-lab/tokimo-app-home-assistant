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
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        {src && (
          <img
            src={src}
            alt={t("ha.detail.camera.preview")}
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            draggable={false}
          />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
            <Loader2 size={32} className="motion-safe:animate-spin" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <CameraOff size={32} />
            <p className="text-sm">{t("ha.detail.camera.unavailable")}</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        {t("ha.detail.camera.snapshotNote")}
      </p>
    </div>
  );
}
