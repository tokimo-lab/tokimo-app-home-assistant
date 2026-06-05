import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useEffect, useRef, useState } from "react";
import { closeEntityMgmt, useEntityMgmtNav } from "../state/useEntityMgmtNav";
import type { HaInstance } from "../types";
import { EntityManagementPage } from "./EntityManagementPage";

interface EntityManagementHostProps {
  instance: HaInstance | null;
  ctx: AppRuntimeCtx;
  t: (k: string) => string;
}

const ANIM_MS = 250;

type Phase = "idle" | "entering" | "open" | "leaving";

/**
 * Slide-in host for the Entity Management page, mirroring `RoomPageHost`.
 * Renders nothing while idle; pushes a full-bleed page right→in / right→out
 * when `useEntityMgmtNav.open` flips. Pure CSS transitions; no extra deps.
 */
export function EntityManagementHost({
  instance,
  ctx,
  t,
}: EntityManagementHostProps) {
  const { open } = useEntityMgmtNav();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mounted, setMounted] = useState(false);
  const enterRafRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setMounted(true);
      setPhase("entering");
      enterRafRef.current = requestAnimationFrame(() => {
        enterRafRef.current = requestAnimationFrame(() => {
          setPhase("open");
        });
      });
    } else if (mounted) {
      setPhase("leaving");
      leaveTimerRef.current = setTimeout(() => {
        setMounted(false);
        setPhase("idle");
        leaveTimerRef.current = null;
      }, ANIM_MS);
    }

    return () => {
      if (enterRafRef.current !== null) {
        cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
    };
  }, [open, mounted]);

  if (phase === "idle" || !mounted || !instance) return null;

  const offscreen = phase === "entering" || phase === "leaving";

  return (
    <div
      className="fixed inset-0 z-30 bg-surface-base"
      style={{
        transform: offscreen ? "translateX(100%)" : "translateX(0)",
        transition: `transform ${ANIM_MS}ms ease-out`,
        willChange: "transform",
      }}
      aria-hidden={phase === "leaving"}
    >
      <EntityManagementPage
        instance={instance}
        ctx={ctx}
        onBack={closeEntityMgmt}
        t={t}
      />
    </div>
  );
}
