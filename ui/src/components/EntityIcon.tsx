import {
  Blinds,
  Camera,
  Cpu,
  Fan,
  Flame,
  Home,
  Lightbulb,
  Lock,
  LockOpen,
  Music,
  PlaySquare,
  Power,
  Radio,
  Settings,
  Thermometer,
  Tv,
  Wind,
  Zap,
} from "lucide-react";

const DOMAIN_ICONS: Record<
  string,
  React.FC<{ size?: number; className?: string }>
> = {
  light: Lightbulb,
  switch: Power,
  cover: Blinds,
  climate: Thermometer,
  fan: Fan,
  lock: Lock,
  media_player: Tv,
  scene: PlaySquare,
  script: Cpu,
  sensor: Radio,
  binary_sensor: Zap,
  camera: Camera,
  vacuum: Wind,
  automation: Settings,
  input_boolean: Power,
  music: Music,
  home: Home,
  flame: Flame,
};

interface EntityIconProps {
  domain: string;
  state?: string;
  size?: number;
  className?: string;
}

export function hasEntityIcon(domain: string): boolean {
  return domain in DOMAIN_ICONS;
}

export function EntityIcon({
  domain,
  state,
  size = 20,
  className,
}: EntityIconProps) {
  const isLocked = domain === "lock" && state === "locked";
  const isUnlocked = domain === "lock" && state === "unlocked";

  if (isLocked) return <Lock size={size} className={className} />;
  if (isUnlocked) return <LockOpen size={size} className={className} />;

  const Icon = DOMAIN_ICONS[domain] ?? Settings;
  return <Icon size={size} className={className} />;
}
