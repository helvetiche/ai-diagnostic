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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await aiMemory.factDelete(id);
    setFacts((prev) => prev.filter((fact) => fact.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await aiMemory.factClear(scope);
    setFacts([]);
  }, [scope]);

  return { facts, loading, error, refresh, remove, clear };
}
