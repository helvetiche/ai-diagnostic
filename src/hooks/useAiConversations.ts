import { useCallback, useEffect, useState } from "react";

import { aiMemory } from "@/lib/aiMemory";
import type { AiConversation } from "@/types/aiMemory";

export function useAiConversations() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await aiMemory.conversationList({ limit: 200, archived: false });
      setConversations(list);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await aiMemory.conversationDelete(id);
    setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
  }, []);

  return { conversations, loading, error, refresh, remove };
}
