import { Plus } from "lucide-react";
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
}

/**
 * Apple-Home–style top bar: title left, [+] add accessory and [⋯] menu right.
 * The add button is currently a placeholder until the Add Accessory flow lands.
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
}: HomePageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {title}
      </h1>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("homeAdd")}
          onClick={() => {
            console.log("[HomePage] add accessory clicked");
          }}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/[0.06]"
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
        />
      </div>
    </div>
  );
}
