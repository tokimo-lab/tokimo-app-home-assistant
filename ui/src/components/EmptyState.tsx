import { Home } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06] text-fg-muted">
        {icon ?? <Home size={28} />}
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-fg-primary">{title}</p>
        {description && (
          <p className="text-sm text-fg-secondary">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
