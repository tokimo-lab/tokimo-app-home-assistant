import type { AppRuntimeCtx } from "@tokimo/sdk";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type {
  HaInstance,
  HaRoom,
  SyncAreasResult,
  UpdateRoomDto,
} from "../../types";
import { FamilyTab } from "./FamilyTab";
import { FavoritesTab } from "./FavoritesTab";
import { RoomsTab } from "./RoomsTab";

export type SettingsTab = "family" | "rooms" | "favorites";

interface SettingsPaneProps {
  instance: HaInstance | null;
  tab: SettingsTab;
  ctx: AppRuntimeCtx;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  onInstanceUpdated?: () => void;
  onInstanceDeleted: () => void;
  rooms: HaRoom[];
  onEditRoom: (roomId: string, dto: UpdateRoomDto) => Promise<unknown>;
  onReloadRooms: () => Promise<unknown> | undefined;
  onSyncAreas: () => Promise<SyncAreasResult>;
  t: (k: string) => string;
}

export function SettingsPane({
  instance,
  tab,
  ctx,
  onTabChange,
  onClose,
  onInstanceUpdated,
  onInstanceDeleted,
  rooms,
  onEditRoom,
  onReloadRooms,
  onSyncAreas,
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
        {instance === null ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/60">{t("noInstances")}</p>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.08] hover:text-white"
            >
              {t("settingsClose")}
            </button>
          </div>
        ) : (
          <>
            {tab === "family" && (
              <FamilyTab
                instance={instance}
                onUpdated={onInstanceUpdated}
                onDeleted={onInstanceDeleted}
                t={t}
              />
            )}
            {tab === "rooms" && (
              <RoomsTab
                instanceId={instance.id}
                rooms={rooms}
                ctx={ctx}
                onEditRoom={onEditRoom}
                onReloadRooms={onReloadRooms}
                onSyncAreas={onSyncAreas}
                t={t}
              />
            )}
            {tab === "favorites" && (
              <FavoritesTab instanceId={instance.id} ctx={ctx} t={t} />
            )}
          </>
        )}
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
