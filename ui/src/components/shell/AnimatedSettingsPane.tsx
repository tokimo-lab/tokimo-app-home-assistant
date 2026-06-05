import { type ReactNode, useRef, useState } from "react";

/**
 * Wraps an inline settings pane so it slides+fades in on open and out on close.
 *
 * On `open` going false we keep rendering the *last* children with the exit
 * animation, then unmount once the animation finishes. During exit the pane
 * is absolutely positioned so the underlying content (which mounts in the
 * same React commit) doesn't fight for layout space, and so the exit overlay
 * paints on top of it from frame 1 — preventing a flicker frame where the
 * new content peeks through.
 */
export function AnimatedSettingsPane({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [render, setRender] = useState(open);
  const lastChildren = useRef<ReactNode>(children);

  if (open) {
    lastChildren.current = children;
    if (!render) {
      setRender(true);
    }
  }

  const exiting = render && !open;

  if (!render) return null;

  return (
    <div
      className={
        exiting
          ? "absolute inset-0 z-10 animate-settings-pane-out bg-surface-base"
          : "absolute inset-0 z-10 animate-settings-pane-in bg-surface-base"
      }
      onAnimationEnd={() => {
        if (exiting) setRender(false);
      }}
    >
      {lastChildren.current}
    </div>
  );
}
