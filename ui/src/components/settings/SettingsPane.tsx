import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { HaRoom, UpdateRoomDto } from "../../types";
import { FamilyTab } from "./FamilyTab";
import { FavoritesTab } from "./FavoritesTab";
import { RoomsTab } from "./RoomsTab";

export type SettingsTab = "family" | "rooms" | "favorites";

interface SettingsPaneProps {
  instanceId: string;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  onInstanceDeleted: () => void;
  rooms: HaRoom[];
  onEditRoom: (roomId: string, dto: UpdateRoomDto) => Promise<unknown>;
  onReloadRooms: () => Promise<unknown> | undefined;
  t: (k: string) => string;
}

export function SettingsPane({
  instanceId,
  tab,
  onTabChange,
  onClose,
  onInstanceDeleted,
  rooms,
  onEditRoom,
  onReloadRooms,
  t,
}: SettingsPaneProps) {
  const titleKey =
    tab === "family"
      ? "settingsTitle"
      : tab === "rooms"
        ? "settingsRoomsTitle"
        : "settingsFavoritesTitle";

  return (
    <div className="flex h-full flex-col bg-[var(--surface-base,#0b0f17)]">
      <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
        <h2 className="text-sm font-semibold text-white">{t(titleKey)}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("settingsClose")}
          title={t("settingsClose")}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <nav className="flex gap-1 border-b border-white/10 px-4">
        <TabButton
          active={tab === "family"}
          onClick={() => onTabChange("family")}
          label={t("settingsTabFamily")}
        />
        <TabButton
          active={tab === "rooms"}
          onClick={() => onTabChange("rooms")}
          label={t("settingsTabRooms")}
        />
        <TabButton
          active={tab === "favorites"}
          onClick={() => onTabChange("favorites")}
          label={t("settingsTabFavorites")}
        />
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "family" && (
          <FamilyTab
            instanceId={instanceId}
            onInstanceDeleted={onInstanceDeleted}
            t={t}
          />
        )}
        {tab === "rooms" && (
          <RoomsTab
            instanceId={instanceId}
            rooms={rooms}
            onEditRoom={onEditRoom}
            onReloadRooms={onReloadRooms}
            t={t}
          />
        )}
        {tab === "favorites" && <FavoritesTab instanceId={instanceId} t={t} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "-mb-px cursor-pointer border-b-2 border-blue-400 px-3 py-2 text-sm font-medium text-white"
          : "cursor-pointer px-3 py-2 text-sm text-white/60 transition hover:text-white"
      }
    >
      {label}
    </button>
  );
}
