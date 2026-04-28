import type { DomainDetailProps } from "./_types";

export function UnsupportedDetail({ t }: DomainDetailProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="font-medium text-base text-zinc-900 dark:text-zinc-100">
        {t("detailUnsupportedTitle")}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {t("detailUnsupportedSubtitle")}
      </p>
    </div>
  );
}
