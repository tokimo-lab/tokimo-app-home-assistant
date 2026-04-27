import { useCallback, useEffect, useState } from "react";
import { listInstances } from "../api/instances";
import type { HaInstance } from "../types";

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
