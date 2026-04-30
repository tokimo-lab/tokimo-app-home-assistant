import { useCallback, useMemo, useSyncExternalStore } from "react";

interface EditHomeViewState {
  editMode: boolean;
  /**
   * Set of currently selected tile entity_ids (the tile's primary entity).
   * Multi-select drives the bottom action bar (merge / split). Always
   * replaced with a fresh Set on update so reference equality works for
   * `useSyncExternalStore` consumers.
   */
  selectedTileIds: ReadonlySet<string>;
  /**
   * When true, the home view is in the "Reorder Sections" sub-mode of
   * edit mode (drag whole rooms vertically). Mutually exclusive with
   * normal tile editing in the UI, but lives behind the same `editMode`
   * gate so `Done` exits both at once.
   */
  reorderSections: boolean;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

let state: EditHomeViewState = {
  editMode: false,
  selectedTileIds: EMPTY_SELECTION,
  reorderSections: false,
};

const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function setState(patch: Partial<EditHomeViewState>) {
  const next = { ...state, ...patch };
  if (
    next.editMode === state.editMode &&
    next.selectedTileIds === state.selectedTileIds &&
    next.reorderSections === state.reorderSections
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
  reorderSections: boolean;
  enterEditMode: () => void;
  enterReorderSections: () => void;
  exitEditMode: () => void;
  /** Set of selected tile primary entity_ids. Frozen-by-reference. */
  selectedTileIds: ReadonlySet<string>;
  /**
   * Single-selection convenience: returns the only id when exactly one tile
   * is selected, otherwise `null`. Used by the resize-handle UI which only
   * makes sense for a single tile.
   */
  selectedTileId: string | null;
  toggleTileSelection: (id: string) => void;
  clearSelection: () => void;
  toggleSize: (id: string) => Promise<void>;
}

/**
 * Global edit-mode toggle for the home view (Apple-Home-style "jiggle"
 * mode). Edit mode is mutually exclusive with normal interaction. Selection
 * is multi-select: tapping a tile toggles its membership in
 * `selectedTileIds`.
 *
 * The bottom action bar reads `selectedTileIds.size` to decide whether to
 * render Merge (≥2) / Split (1, when the tile has ≥2 members) / nothing (0).
 *
 * `toggleSize` is a thin pass-through to whatever was registered via
 * `registerToggleSize`. Until something registers it, calls warn and
 * resolve to a no-op so the caller code path stays exercised in tests.
 */
export function useEditHomeView(): UseEditHomeViewResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const enterEditMode = useCallback(() => {
    setState({ editMode: true, reorderSections: false });
  }, []);

  const enterReorderSections = useCallback(() => {
    setState({
      editMode: true,
      reorderSections: true,
      selectedTileIds: EMPTY_SELECTION,
    });
  }, []);

  const exitEditMode = useCallback(() => {
    setState({
      editMode: false,
      reorderSections: false,
      selectedTileIds: EMPTY_SELECTION,
    });
  }, []);

  const toggleTileSelection = useCallback((id: string) => {
    const current = state.selectedTileIds;
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setState({ selectedTileIds: next });
  }, []);

  const clearSelection = useCallback(() => {
    if (state.selectedTileIds.size === 0) return;
    setState({ selectedTileIds: EMPTY_SELECTION });
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

  const selectedTileId = useMemo(() => {
    if (snap.selectedTileIds.size !== 1) return null;
    const it = snap.selectedTileIds.values().next();
    return it.done ? null : it.value;
  }, [snap.selectedTileIds]);

  return {
    editMode: snap.editMode,
    reorderSections: snap.reorderSections,
    enterEditMode,
    enterReorderSections,
    exitEditMode,
    selectedTileIds: snap.selectedTileIds,
    selectedTileId,
    toggleTileSelection,
    clearSelection,
    toggleSize,
  };
}

// Test-only reset hook (also useful when the active HA instance changes).
export function __resetEditHomeViewForTests(): void {
  state = {
    editMode: false,
    selectedTileIds: EMPTY_SELECTION,
    reorderSections: false,
  };
  toggleSizeImpl = null;
  emit();
}
