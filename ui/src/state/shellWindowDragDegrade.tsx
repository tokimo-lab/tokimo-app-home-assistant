import type { AppRuntimeCtx } from "@tokimo/sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

const ShellWindowDragDegradeContext = createContext(false);

export function useShellWindowDragDegrade(ctx: AppRuntimeCtx): boolean {
  const drag = ctx.shell.windowDrag;
  const subscribe = useCallback(
    (onStoreChange: () => void) => drag.subscribe(onStoreChange),
    [drag],
  );
  const getSnapshot = useCallback(() => drag.getSnapshot().active, [drag]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function ShellWindowDragDegradeProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <ShellWindowDragDegradeContext.Provider value={active}>
      {children}
    </ShellWindowDragDegradeContext.Provider>
  );
}

export function useShellWindowDragDegraded(): boolean {
  return useContext(ShellWindowDragDegradeContext);
}
