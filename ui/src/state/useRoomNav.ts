import { useCallback, useSyncExternalStore } from "react";

interface RoomNavState {
  stack: string[];
}

let state: RoomNavState = { stack: [] };
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): RoomNavState {
  return state;
}

export function pushRoom(roomId: string): void {
  state = { stack: [...state.stack, roomId] };
  emit();
}

export function popRoom(): void {
  if (state.stack.length === 0) return;
  state = { stack: state.stack.slice(0, -1) };
  emit();
}

export function clearRoomStack(): void {
  if (state.stack.length === 0) return;
  state = { stack: [] };
  emit();
}

export interface UseRoomNavResult {
  /** Top-of-stack room id (the currently visible RoomPage), or null. */
  openRoomId: string | null;
  /** Full stack (oldest-first). Useful for back-label / animation depth. */
  stack: string[];
  pushRoom: (roomId: string) => void;
  popRoom: () => void;
  clearRoomStack: () => void;
}

/**
 * Apple-Home-style page-level push/pop stack for room views.
 *
 * Unlike `useDetailOverlay` (which is an entity-detail card stack rendered
 * over the home grid), this is a *page* navigation stack: the top of the
 * stack replaces the HomePage view entirely via slide-in animation managed
 * by `<RoomPageHost>`.
 */
export function useRoomNav(): UseRoomNavResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const openRoomId =
    snap.stack.length > 0 ? snap.stack[snap.stack.length - 1] : null;

  const push = useCallback((roomId: string) => {
    pushRoom(roomId);
  }, []);
  const pop = useCallback(() => {
    popRoom();
  }, []);
  const clear = useCallback(() => {
    clearRoomStack();
  }, []);

  return {
    openRoomId: openRoomId ?? null,
    stack: snap.stack,
    pushRoom: push,
    popRoom: pop,
    clearRoomStack: clear,
  };
}

// Test-only reset.
export function __resetRoomNavForTests(): void {
  state = { stack: [] };
  emit();
}
