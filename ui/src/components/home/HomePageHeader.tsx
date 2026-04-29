import { ChevronDown, Plus } from "lucide-react";
import type { HaRoom } from "../../types";
import { HomeMenu } from "./HomeMenu";

export interface HomePageHeaderProps {
  title: string;
  instanceId: string;
  rooms: HaRoom[];
  t: (k: string) => string;
  onOpenSettings: () => void;
  onEnterEditMode: () => void;
  onEnterReorderSections: () => void;
  onOpenRoom: (id: string) => void;
  onRescan?: () => void;
  showAll?: boolean;
  onToggleShowAll?: () => void;
}

/**
 * Apple-Home-style top bar:
 *   left  – home name (bold, large) + ChevronDown placeholder for switching homes
 *   right – round [+] add accessory placeholder + round [⋯] menu button
 */
export function HomePageHeader({
  title,
  instanceId,
  rooms,
  t,
  onOpenSettings,
  onEnterEditMode,
  onEnterReorderSections,
  onOpenRoom,
  onRescan,
  showAll,
  onToggleShowAll,
}: HomePageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        aria-label={t("homeSwitch")}
        onClick={() => {
          // Placeholder: home switcher is a future feature.
          console.log("[HomePage] switch home clicked");
        }}
        className="flex cursor-pointer items-center gap-1 text-[var(--text-primary)] transition hover:opacity-80"
      >
        <span className="text-3xl font-bold leading-tight">{title}</span>
        <ChevronDown size={22} className="text-[var(--text-secondary)]" />
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t("homeAdd")}
          onClick={() => {
            console.log("[HomePage] add accessory clicked");
          }}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] text-[var(--text-primary)] transition hover:bg-white/[0.1]"
        >
          <Plus size={20} />
        </button>
        <HomeMenu
          instanceId={instanceId}
          rooms={rooms}
          t={t}
          onOpenSettings={onOpenSettings}
          onEditHomeView={onEnterEditMode}
          onReorderSections={onEnterReorderSections}
          onOpenRoom={onOpenRoom}
          onRescan={onRescan}
          showAll={showAll}
          onToggleShowAll={onToggleShowAll}
        />
      </div>
    </div>
  );
}
