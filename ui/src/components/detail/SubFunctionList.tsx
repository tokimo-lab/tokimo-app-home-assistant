/**
 * Sub-functions list for DetailOverlay (P7.4).
 * Displays inline controls for accessory sub-members.
 */
import { ChevronRight } from "lucide-react";
import { getFriendlyName } from "../../lib/format";
import type { CallParams, EntityState } from "../../types";
import { EntityIcon, hasEntityIcon } from "../EntityIcon";
import { SubFunctionBinarySensor } from "./subfunctions/SubFunctionBinarySensor";
import { SubFunctionButton } from "./subfunctions/SubFunctionButton";
import { SubFunctionNumber } from "./subfunctions/SubFunctionNumber";
import { SubFunctionSelect } from "./subfunctions/SubFunctionSelect";
import { SubFunctionSensor } from "./subfunctions/SubFunctionSensor";
import { SubFunctionToggle } from "./subfunctions/SubFunctionToggle";

interface SubFunctionListProps {
  subMembers: EntityState[];
  onCall: (params: CallParams) => void;
  onNavigate: (entityId: string) => void;
  t: (k: string) => string;
}

export function SubFunctionList({
  subMembers,
  onCall,
  onNavigate,
  t,
}: SubFunctionListProps) {
  if (subMembers.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-zinc-100 pt-2 dark:border-zinc-800/60">
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {subMembers.map((entity) => (
          <SubFunctionRow
            key={entity.entity_id}
            entity={entity}
            onCall={onCall}
            onNavigate={onNavigate}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

interface SubFunctionRowProps {
  entity: EntityState;
  onCall: (params: CallParams) => void;
  onNavigate: (entityId: string) => void;
  t: (k: string) => string;
}

function SubFunctionRow({
  entity,
  onCall,
  onNavigate,
  t,
}: SubFunctionRowProps) {
  const { entity_id, state } = entity;
  const domain = entity_id.split(".")[0] ?? "";
  const name = getFriendlyName(entity);
  const showIcon = hasEntityIcon(domain);

  const control = renderControl(entity, domain, onCall, t);
  const hasControl = control !== null;

  const iconNode = showIcon ? (
    <EntityIcon
      domain={domain}
      state={state}
      size={20}
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
    />
  ) : null;

  if (hasControl) {
    return (
      <div className="flex items-center gap-3 py-3.5">
        {iconNode}
        <span className="flex-1 text-[15px] text-zinc-900 dark:text-zinc-100">
          {name}
        </span>
        <div className="flex items-center gap-2">{control}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(entity_id)}
      className="flex w-full cursor-pointer items-center gap-3 py-3.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      {iconNode}
      <span className="flex-1 text-[15px] text-zinc-900 dark:text-zinc-100">
        {name}
      </span>
      <ChevronRight size={16} className="text-zinc-400 dark:text-zinc-500" />
    </button>
  );
}

function renderControl(
  entity: EntityState,
  domain: string,
  onCall: (params: CallParams) => void,
  t: (k: string) => string,
): JSX.Element | null {
  const { entity_id, state } = entity;

  // Toggle switch (switch / light / input_boolean / fan with boolean state)
  if (
    domain === "switch" ||
    domain === "light" ||
    domain === "input_boolean" ||
    (domain === "fan" && (state === "on" || state === "off"))
  ) {
    const isOn = state === "on";
    const onToggle = () => {
      onCall({
        entity_id,
        domain,
        service: isOn ? "turn_off" : "turn_on",
        target: { entity_id },
        optimisticState: isOn ? "off" : "on",
      });
    };
    return <SubFunctionToggle entity={entity} onToggle={onToggle} />;
  }

  // Sensor (numeric / textual state)
  if (domain === "sensor") {
    return <SubFunctionSensor entity={entity} />;
  }

  // Binary sensor
  if (domain === "binary_sensor") {
    return <SubFunctionBinarySensor entity={entity} t={t} />;
  }

  // Select / input_select
  if (domain === "select" || domain === "input_select") {
    const onSelect = (option: string) => {
      onCall({
        entity_id,
        domain: domain === "select" ? "select" : "input_select",
        service: "select_option",
        target: { entity_id },
        data: { option },
        optimisticState: option,
      });
    };
    return <SubFunctionSelect entity={entity} onSelect={onSelect} />;
  }

  // Number / input_number
  if (domain === "number" || domain === "input_number") {
    const onSet = (value: number) => {
      onCall({
        entity_id,
        domain: domain === "number" ? "number" : "input_number",
        service: "set_value",
        target: { entity_id },
        data: { value },
        optimisticState: String(value),
      });
    };
    return <SubFunctionNumber entity={entity} onSet={onSet} />;
  }

  // Button / scene / script
  if (domain === "button" || domain === "scene" || domain === "script") {
    const onPress = () => {
      let service = "press";
      if (domain === "scene") service = "turn_on";
      if (domain === "script") service = "turn_on";
      onCall({
        entity_id,
        domain,
        service,
        target: { entity_id },
      });
    };
    return (
      <SubFunctionButton label={t("detailSubFunctionRun")} onPress={onPress} />
    );
  }

  // Fallback: show state text (non-interactive)
  return (
    <span className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
      {state}
    </span>
  );
}
