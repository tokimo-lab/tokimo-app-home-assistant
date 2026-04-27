import { Button } from "@tokimo/ui";
import { Home, Plus } from "lucide-react";

interface SetupPageProps {
  onAddInstance: () => void;
  t: (k: string) => string;
}

export function SetupPage({ onAddInstance, t }: SetupPageProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent-subtle,rgba(99,102,241,0.15))]">
        <Home size={40} className="text-[var(--accent,#6366f1)]" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {t("setupTitle")}
        </h1>
        <p className="max-w-sm text-sm text-[var(--text-secondary)]">
          {t("setupSubtitle")}
        </p>
      </div>

      <Button variant="primary" onClick={onAddInstance}>
        <Plus size={16} />
        {t("setupAddButton")}
      </Button>
    </div>
  );
}
