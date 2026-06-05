import {
  type AppRuntimeCtx,
  type MenuBarConfig,
  type MenuBarMenu,
} from "@tokimo/sdk";
import { useShellMenuBar, useShellToast } from "@tokimo/sdk/react";
import { Checkbox, Modal } from "@tokimo/ui";
import { FolderSync, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { rescanInstance } from "../../api/client";
import type { HaInstance } from "../../types";

interface HomeAssistantMenuBarProps {
  ctx: AppRuntimeCtx;
  instances: HaInstance[];
  t: (key: string, fallback?: string) => string;
  reloadInstances: () => void | Promise<void>;
  children: ReactNode;
}

export function HomeAssistantMenuBar({
  ctx,
  instances,
  t,
  reloadInstances,
  children,
}: HomeAssistantMenuBarProps) {
  const toast = useShellToast(ctx);

  const [open, setOpen] = useState(false);
  const [clearData, setClearData] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const menuConfig = useMemo<MenuBarConfig>(() => {
    const menus: MenuBarMenu[] = [
      {
        key: "home-assistant",
        label: "Home Assistant",
        items: [
          {
            key: "reload",
            label: t("menuReload"),
            icon: <RefreshCw size={14} />,
            onClick: () => void reloadInstances(),
          },
        ],
      },
    ];

    if (instances.length > 0) {
      const tmpl = t("syncFamilyItem", "同步「{name}」");
      menus.push({
        key: "actions",
        label: t("menuActions", "操作"),
        items: instances.map((inst) => ({
          key: `sync-${inst.id}`,
          label: tmpl.replace("{name}", inst.name),
          icon: <FolderSync size={14} />,
          onClick: () => {
            setTargetId(inst.id);
            setClearData(false);
            setOpen(true);
          },
        })),
      });
    }

    return {
      menus,
      about: { description: "Home Assistant", version: "0.1.0" },
    };
  }, [instances, t, reloadInstances]);

  useShellMenuBar(ctx, menuConfig);

  const handleConfirm = async () => {
    if (!targetId) return;
    setPending(true);
    try {
      // TODO(phase-2): backend may not yet honour `clear_data`; we still
      // forward the flag so the contract is in place for when it lands.
      await rescanInstance(targetId, clearData);
      toast.success(t("syncStartedToast", "同步已开始"));
      setOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : t("syncFailedToast", "同步失败");
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {children}
      <Modal
        open={open}
        title={t("syncModalTitle", "同步家庭")}
        okText={t("syncConfirm", "开始同步")}
        cancelText={t("syncCancel", "取消")}
        okButtonProps={{ loading: pending, disabled: pending }}
        maskClosable={!pending}
        onCancel={() => {
          if (pending) return;
          setOpen(false);
        }}
        onOk={handleConfirm}
      >
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={clearData}
            onChange={(e) => setClearData(e.target.checked)}
          >
            {t("syncClearLabel", "清空数据重新同步")}
          </Checkbox>
          <p className="text-xs text-fg-secondary">
            {t(
              "syncClearHint",
              "勾选后将删除该家庭中所有设备并重新完整同步，适合修复数据异常。",
            )}
          </p>
        </div>
      </Modal>
    </>
  );
}
