import { Maximize2 } from "lucide-react";

interface ResizeHandleProps {
  onClick: () => void;
  /** i18n helper from the parent tile. */
  t: (k: string) => string;
}

/**
 * Edit-mode resize button rendered at the top-right corner of a selected tile.
 * Clicking it cycles the tile through small → medium → large → small.
 *
 * TODO(i18n): add key "home.editMode.resize" to en-US.ts / zh-CN.ts
 */
export function ResizeHandle({ onClick, t }: ResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label={t("home.editMode.resize")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white shadow-md text-gray-700 transition hover:scale-110 active:scale-95"
    >
      <Maximize2 size={12} />
    </button>
  );
}
