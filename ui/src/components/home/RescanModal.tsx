import { Checkbox, Modal } from "@tokimo/ui";
import { useState } from "react";

interface RescanModalProps {
  open: boolean;
  loading: boolean;
  t: (k: string) => string;
  onConfirm: (clearData: boolean) => void;
  onCancel: () => void;
}

export function RescanModal({
  open,
  loading,
  t,
  onConfirm,
  onCancel,
}: RescanModalProps) {
  const [clearData, setClearData] = useState(false);

  return (
    <Modal
      open={open}
      title={t("rescanModalTitle")}
      okText={loading ? t("rescanInProgress") : t("rescanConfirm")}
      cancelText={t("rescanCancel")}
      okButtonProps={{ loading, disabled: loading }}
      onOk={() => onConfirm(clearData)}
      onCancel={onCancel}
      maskClosable={!loading}
    >
      <div className="flex flex-col gap-3">
        <Checkbox
          checked={clearData}
          onChange={(e) => setClearData(e.target.checked)}
        >
          {t("rescanClearLabel")}
        </Checkbox>
        <p className="text-xs text-[var(--text-secondary)]">
          {t("rescanClearHint")}
        </p>
      </div>
    </Modal>
  );
}
