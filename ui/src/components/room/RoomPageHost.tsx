import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useEffect, useRef, useState } from "react";
import { useRoomNav } from "../../state/useRoomNav";
import type {
  CallParams,
  EntityState,
  HaInstance,
  HaRoom,
  PendingOp,
} from "../../types";
import { RoomPage } from "./RoomPage";

interface RoomPageHostProps {
  instance: HaInstance;
  entities: ReadonlyMap<string, EntityState>;
  rooms: HaRoom[];
  ctx: AppRuntimeCtx;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

const ANIM_MS = 250;

type Phase = "idle" | "entering" | "open" | "leaving";

/**
 * Renders the active room (if any) as a full-bleed page that slides
 * in over the HomePage. The slide direction is right→in / right→out
 * (push-page metaphor). Pure CSS transitions; no extra deps.
 *
 * Why a separate "leaving" phase: when `popRoom()` is called the
 * current `openRoomId` becomes null immediately, but we still need
 * to keep the DOM mounted long enough to play the exit transform.
 */
export function RoomPageHost(props: RoomPageHostProps) {
  const { openRoomId, popRoom } = useRoomNav();
  const [phase, setPhase] = useState<Phase>("idle");
  const [renderedRoomId, setRenderedRoomId] = useState<string | null>(null);
  const enterRafRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (openRoomId) {
      // Enter (or swap target room mid-flight).
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setRenderedRoomId(openRoomId);
      setPhase("entering");
      // Next frame: flip to "open" so the transition runs.
      enterRafRef.current = requestAnimationFrame(() => {
        enterRafRef.current = requestAnimationFrame(() => {
          setPhase("open");
        });
      });
    } else if (renderedRoomId !== null) {
      // Exit: keep DOM mounted for ANIM_MS while transform animates out.
      setPhase("leaving");
      leaveTimerRef.current = setTimeout(() => {
        setRenderedRoomId(null);
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
  }, [openRoomId, renderedRoomId]);

  if (phase === "idle" || renderedRoomId === null) return null;

  const offscreen = phase === "entering" || phase === "leaving";

  return (
    <div
      className="fixed inset-0 z-30 bg-white dark:bg-zinc-950"
      style={{
        transform: offscreen ? "translateX(100%)" : "translateX(0)",
        transition: `transform ${ANIM_MS}ms ease-out`,
        willChange: "transform",
      }}
      aria-hidden={phase === "leaving"}
    >
      <RoomPage
        roomId={renderedRoomId}
        instance={props.instance}
        entities={props.entities}
        rooms={props.rooms}
        ctx={props.ctx}
        getPending={props.getPending}
        onCall={props.onCall}
        onBack={popRoom}
        t={props.t}
      />
    </div>
  );
}
