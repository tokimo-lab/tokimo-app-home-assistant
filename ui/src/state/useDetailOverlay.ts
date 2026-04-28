import { useCallback, useSyncExternalStore } from "react";

export interface DetailEntry {
  entityId: string;
  instanceId: string;
}

interface DetailOverlayState {
  stack: DetailEntry[];
}

let state: DetailOverlayState = { stack: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): DetailOverlayState {
  return state;
}

/**
 * Escape-hatch: the host shell (Tokimo) is expected to plug in a real
 * `openModalWindow` here. Until H4+ wires this through, we fall back to
 * `openDetail` so the call still does something sensible.
 *
 * The host should call `registerOpenInNewWindow(fn)` once at mount and
 * `registerOpenInNewWindow(null)` on unmount.
 */
export type OpenInNewWindowFn = (entry: DetailEntry) => void;
let openInNewWindowImpl: OpenInNewWindowFn | null = null;

export function registerOpenInNewWindow(fn: OpenInNewWindowFn | null): void {
  openInNewWindowImpl = fn;
}

export interface UseDetailOverlayResult {
  currentEntity: DetailEntry | null;
  openDetail: (entityId: string, instanceId: string) => void;
  closeDetail: () => void;
  openInNewWindow: (entityId: string, instanceId: string) => void;
}

/**
 * Apple-Home-style detail overlay. Only the top of the stack is visible;
 * `closeDetail` pops one level (so detail → child detail → close behaves
 * like a back button). `openInNewWindow` delegates to the host shell so
 * the user can pop a detail card out into its own Tokimo window.
 */
export function useDetailOverlay(): UseDetailOverlayResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const currentEntity =
    snap.stack.length > 0 ? snap.stack[snap.stack.length - 1] : null;

  const openDetail = useCallback((entityId: string, instanceId: string) => {
    state = { stack: [...state.stack, { entityId, instanceId }] };
    emit();
  }, []);

  const closeDetail = useCallback(() => {
    if (state.stack.length === 0) return;
    state = { stack: state.stack.slice(0, -1) };
    emit();
  }, []);

  const openInNewWindow = useCallback(
    (entityId: string, instanceId: string) => {
      if (openInNewWindowImpl) {
        openInNewWindowImpl({ entityId, instanceId });
        return;
      }
      console.warn(
        "[useDetailOverlay] openInNewWindow not registered by host shell; " +
          "falling back to inline detail",
      );
      state = { stack: [...state.stack, { entityId, instanceId }] };
      emit();
    },
    [],
  );

  return {
    currentEntity: currentEntity ?? null,
    openDetail,
    closeDetail,
    openInNewWindow,
  };
}

// Test-only reset.
export function __resetDetailOverlayForTests(): void {
  state = { stack: [] };
  openInNewWindowImpl = null;
  emit();
}
