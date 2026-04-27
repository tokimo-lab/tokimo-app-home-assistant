import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { DetailPopover } from "../DetailPopover";

const LONG_PRESS_MS = 350;
const MOVE_THRESHOLD = 8;

interface TileBaseProps {
  gradient: string;
  children: ReactNode;
  detail?: ReactNode;
  detailTitle?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function TileBase({
  gradient,
  children,
  detail,
  detailTitle,
  onClick,
  className = "",
  disabled = false,
}: TileBaseProps) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const [showDetail, setShowDetail] = useState(false);

  function cancelTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (pointerIdRef.current !== null) return; // already tracking
    if (e.button !== 0) return; // primary button only

    pointerIdRef.current = e.pointerId;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    didLongPressRef.current = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // silently ignored (synthetic event in tests)
    }

    if (detail) {
      timerRef.current = setTimeout(() => {
        didLongPressRef.current = true;
        setShowDetail(true);
        timerRef.current = null;
      }, LONG_PRESS_MS);
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    if (!startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      cancelTimer();
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    cancelTimer();
    pointerIdRef.current = null;
    startPosRef.current = null;

    if (!didLongPressRef.current && !disabled) {
      onClick?.();
    }
    didLongPressRef.current = false;
  }

  function handlePointerCancel(e: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    cancelTimer();
    pointerIdRef.current = null;
    startPosRef.current = null;
    didLongPressRef.current = false;
  }

  return (
    <>
      <button
        ref={tileRef}
        type="button"
        className={`relative h-[88px] select-none rounded-[22px] overflow-hidden transition-transform active:scale-[0.97] ${disabled ? "opacity-50" : "cursor-pointer"} ${className}`}
        style={{ background: gradient }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        <div className="flex h-full flex-col justify-between p-3">
          {children}
        </div>
      </button>

      {showDetail && tileRef.current && (
        <DetailPopover
          anchor={tileRef.current}
          title={detailTitle}
          onClose={() => setShowDetail(false)}
        >
          {detail}
        </DetailPopover>
      )}
    </>
  );
}
