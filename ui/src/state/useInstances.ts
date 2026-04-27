import { useCallback, useEffect, useState } from "react";
import { listInstances } from "../api/instances";
import type { HaInstance } from "../types";
import { getActiveInstance, setActiveInstance } from "./activeInstanceStore";

export function useInstances() {
  const [instances, setInstances] = useState<HaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInstances();
      setInstances(data);
      // Reconcile activeInstanceStore: if the active id no longer exists
      // in the backend list, fall back to first valid instance or clear it.
      const active = getActiveInstance();
      if (active.id && !data.some((i) => i.id === active.id)) {
        if (data.length > 0) {
          setActiveInstance(data[0].id, data[0].name);
        } else {
          setActiveInstance(null, null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { instances, loading, error, reload: load };
}
