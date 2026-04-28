import { useCallback, useSyncExternalStore } from "react";

interface EditHomeViewState {
  editMode: boolean;
  selectedTileId: string | null;
}

let state: EditHomeViewState = {
  editMode: false,
  selectedTileId: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function setState(patch: Partial<EditHomeViewState>) {
  const next = { ...state, ...patch };
  if (
    next.editMode === state.editMode &&
    next.selectedTileId === state.selectedTileId
  ) {
    return;
  }
  state = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): EditHomeViewState {
  return state;
}

/**
 * Caller-supplied size mutator. Wired in by HomePage so this hook stays
 * dependency-free and unit-testable. `next` is `undefined` when the caller
 * has no preferred next size and just wants the size to cycle.
 */
export type ToggleSizeFn = (entityId: string) => Promise<void>;

let toggleSizeImpl: ToggleSizeFn | null = null;

/**
 * Allow the host (typically HomePage, which has access to useDisplayPatch)
 * to plug in the actual size-cycle implementation. Calling with `null`
 * unregisters (e.g. on unmount).
 */
export function registerToggleSize(fn: ToggleSizeFn | null): void {
  toggleSizeImpl = fn;
}

export interface UseEditHomeViewResult {
  editMode: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  selectedTileId: string | null;
  selectTile: (id: string | null) => void;
  toggleSize: (id: string) => Promise<void>;
}

/**
 * Global edit-mode toggle for the home view (Apple-Home-style "jiggle"
 * mode). Edit mode is mutually exclusive with normal interaction, and only
 * one tile may be `selected` at a time (this is what shows the ↗ resize
 * handle).
 *
 * `toggleSize` is a thin pass-through to whatever was registered via
 * `registerToggleSize`. Until something registers it, calls warn and
 * resolve to a no-op so the caller code path stays exercised in tests.
 */
export function useEditHomeView(): UseEditHomeViewResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const enterEditMode = useCallback(() => {
    setState({ editMode: true });
  }, []);

  const exitEditMode = useCallback(() => {
    setState({ editMode: false, selectedTileId: null });
  }, []);

  const selectTile = useCallback((id: string | null) => {
    setState({ selectedTileId: id });
  }, []);

  const toggleSize = useCallback(async (id: string) => {
    if (!toggleSizeImpl) {
      console.warn(
        "[useEditHomeView] toggleSize called but no implementation registered",
      );
      return;
    }
    await toggleSizeImpl(id);
  }, []);

  return {
    editMode: snap.editMode,
    enterEditMode,
    exitEditMode,
    selectedTileId: snap.selectedTileId,
    selectTile,
    toggleSize,
  };
}

// Test-only reset hook (also useful when the active HA instance changes).
export function __resetEditHomeViewForTests(): void {
  state = { editMode: false, selectedTileId: null };
  toggleSizeImpl = null;
  emit();
}
