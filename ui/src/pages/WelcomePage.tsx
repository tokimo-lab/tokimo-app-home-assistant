import { Home, Lock, Sparkles, Users } from "lucide-react";

interface WelcomePageProps {
  t: (k: string) => string;
  onGetStarted: () => void;
}

export function WelcomePage({ t, onGetStarted }: WelcomePageProps) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-[var(--surface-base,#0b0f17)] px-8 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-10 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 shadow-[0_20px_60px_-15px_rgba(120,80,255,0.6)]">
          <Home size={44} className="text-white" strokeWidth={2.2} />
          <Sparkles
            size={18}
            className="absolute -right-1 -top-1 text-amber-300"
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {t("welcomeTitle")}
          </h1>
          <p className="max-w-xs text-base leading-relaxed text-white/60">
            {t("welcomeSlogan")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <FeatureRow
            icon={<Sparkles size={20} className="text-indigo-300" />}
            text={t("welcomeFeatureControl")}
          />
          <FeatureRow
            icon={<Lock size={20} className="text-emerald-300" />}
            text={t("welcomeFeatureLocal")}
          />
          <FeatureRow
            icon={<Users size={20} className="text-amber-300" />}
            text={t("welcomeFeatureMulti")}
          />
        </div>

        <button
          type="button"
          onClick={onGetStarted}
          className="mt-2 w-full cursor-pointer rounded-2xl bg-white py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {t("welcomeCta")}
        </button>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-left">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/[0.06]">
        {icon}
      </div>
      <span className="text-sm leading-snug text-white/85">{text}</span>
    </div>
  );
}
