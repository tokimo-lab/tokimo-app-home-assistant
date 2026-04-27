import { Input } from "@tokimo/ui";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { resolveTile } from "../components/tiles";
import { getDomain } from "../lib/domain";
import type { CallParams, EntityState, PendingOp } from "../types";

interface DevicesPageProps {
  entities: ReadonlyMap<string, EntityState>;
  instanceId: string;
  getPending: (entityId: string) => PendingOp | undefined;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

const ALL_DOMAIN = "__all__";

const SHOWN_DOMAINS = [
  "light",
  "switch",
  "cover",
  "climate",
  "fan",
  "lock",
  "media_player",
  "scene",
  "script",
  "binary_sensor",
  "sensor",
  "camera",
  "vacuum",
  "input_boolean",
  "automation",
];

export function DevicesPage({
  entities,
  instanceId,
  getPending,
  onCall,
  t,
}: DevicesPageProps) {
  const [domainFilter, setDomainFilter] = useState<string>(ALL_DOMAIN);
  const [search, setSearch] = useState("");

  const allEntities = useMemo(
    () =>
      Array.from(entities.values()).filter((e) =>
        SHOWN_DOMAINS.includes(getDomain(e.entity_id)),
      ),
    [entities],
  );

  const presentDomains = useMemo(
    () => [...new Set(allEntities.map((e) => getDomain(e.entity_id)))].sort(),
    [allEntities],
  );

  const filtered = useMemo(() => {
    let list = allEntities;
    if (domainFilter !== ALL_DOMAIN) {
      list = list.filter((e) => getDomain(e.entity_id) === domainFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          (e.attributes.friendly_name?.toLowerCase() ?? "").includes(q) ||
          e.entity_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allEntities, domainFilter, search]);

  function domainLabel(d: string): string {
    const key = `domain_${d}`;
    const translated = t(key);
    return translated !== key ? translated : d.replace("_", " ");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4">
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("devicesSearch")}
            className="pl-8"
          />
        </div>

        {/* Domain chips */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setDomainFilter(ALL_DOMAIN)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs transition ${
              domainFilter === ALL_DOMAIN
                ? "bg-[var(--accent)] text-white"
                : "bg-white/[0.08] text-[var(--text-secondary)] hover:bg-white/[0.14]"
            }`}
          >
            {t("devicesAll")} ({allEntities.length})
          </button>
          {presentDomains.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomainFilter(d)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs transition ${
                domainFilter === d
                  ? "bg-[var(--accent)] text-white"
                  : "bg-white/[0.08] text-[var(--text-secondary)] hover:bg-white/[0.14]"
              }`}
            >
              {domainLabel(d)} (
              {allEntities.filter((e) => getDomain(e.entity_id) === d).length})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title={search ? t("devicesNoResults") : t("devicesEmpty")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((entity) => {
              const Tile = resolveTile(entity);
              return (
                <Tile
                  key={entity.entity_id}
                  entity={entity}
                  instanceId={instanceId}
                  pending={getPending(entity.entity_id)}
                  onCall={onCall}
                  t={t}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
