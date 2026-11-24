import { useCallback, useEffect, useState } from "react";

import { aiMemory } from "@/lib/aiMemory";
import type { AiConversation, AiMessage } from "@/types/aiMemory";

export function useAiConversations() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await aiMemory.conversationList(200);
      setConversations(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (title?: string, contextKey?: string) => {
      const conv = await aiMemory.conversationCreate(title, contextKey);
      setConversations((prev) => [conv, ...prev]);
      return conv;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await aiMemory.conversationDelete(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { conversations, loading, error, refresh, create, remove };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const list = await aiMemory.messageList(conversationId, 500);
      setMessages(list);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const append = useCallback(
    async (
      role: AiMessage["role"],
      content: string,
      model?: string,
      tokens?: number,
    ) => {
      if (!conversationId) return null;
      const msg = await aiMemory.messageAppend(conversationId, role, content, model, tokens);
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [conversationId],
  );

  return { messages, loading, refresh, append };
}