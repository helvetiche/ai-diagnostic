import { useCallback, useEffect, useState } from "react";

import { aiMemory } from "@/lib/aiMemory";
import type { AiMemoryFact } from "@/types/aiMemory";

export function useAiMemoryFacts(scope?: string) {
  const [facts, setFacts] = useState<AiMemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await aiMemory.factList(scope, false);
      setFacts(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsert = useCallback(
    async (input: Parameters<typeof aiMemory.factUpsert>[0]) => {
      const fact = await aiMemory.factUpsert(input);
      setFacts((prev) => {
        const idx = prev.findIndex((f) => f.id === fact.id || (f.scope === fact.scope && f.key === fact.key));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = fact;
          return next;
        }
        return [fact, ...prev];
      });
      return fact;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await aiMemory.factDelete(id);
    setFacts((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await aiMemory.factClear(scope);
    setFacts([]);
  }, [scope]);

  return { facts, loading, error, refresh, upsert, remove, clear };
}