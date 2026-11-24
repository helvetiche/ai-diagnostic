import { invoke } from "@tauri-apps/api/core";

import type {
  AiConversation,
  AiMemoryFact,
  AiMessage,
  MemorySearchHit,
  MemoryStats,
} from "@/types/aiMemory";

export const aiMemory = {
  conversationCreate: (title?: string, contextKey?: string) =>
    invoke<AiConversation>("memory_conversation_create", { title, contextKey }),

  conversationList: (limit?: number, offset?: number, archived?: boolean) =>
    invoke<AiConversation[]>("memory_conversation_list", { limit, offset, archived }),

  conversationGet: (id: string) =>
    invoke<AiConversation>("memory_conversation_get", { id }),

  conversationDelete: (id: string) =>
    invoke<void>("memory_conversation_delete", { id }),

  conversationArchive: (id: string, archived: boolean) =>
    invoke<void>("memory_conversation_archive", { id, archived }),

  conversationTouch: (id: string, title?: string) =>
    invoke<void>("memory_conversation_touch", { id, title }),

  messageAppend: (
    conversationId: string,
    role: AiMessage["role"],
    content: string,
    model?: string,
    tokens?: number,
  ) =>
    invoke<AiMessage>("memory_message_append", {
      conversationId,
      role,
      content,
      model,
      tokens,
    }),

  messageList: (conversationId: string, limit?: number) =>
    invoke<AiMessage[]>("memory_message_list", { conversationId, limit }),

  messageDelete: (id: string) =>
    invoke<void>("memory_message_delete", { id }),

  factUpsert: (input: {
    scope?: string;
    key: string;
    value: string;
    source?: AiMemoryFact["source"];
    confidence?: number;
    expiresAt?: number;
    pinned?: boolean;
  }) =>
    invoke<AiMemoryFact>("memory_fact_upsert", {
      scope: input.scope,
      key: input.key,
      value: input.value,
      source: input.source,
      confidence: input.confidence,
      expiresAt: input.expiresAt,
      pinned: input.pinned,
    }),

  factList: (scope?: string, includeExpired?: boolean) =>
    invoke<AiMemoryFact[]>("memory_fact_list", { scope, includeExpired }),

  factDelete: (id: string) =>
    invoke<void>("memory_fact_delete", { id }),

  factClear: (scope?: string) =>
    invoke<void>("memory_fact_clear", { scope }),

  searchIndexUpsert: (entityType: string, entityId: string, title: string, body: string) =>
    invoke<void>("memory_search_index_upsert", { entityType, entityId, title, body }),

  searchIndexDelete: (entityType: string, entityId: string) =>
    invoke<void>("memory_search_index_delete", { entityType, entityId }),

  search: (query: string, limit?: number) =>
    invoke<MemorySearchHit[]>("memory_search", { query, limit }),

  stats: () => invoke<MemoryStats>("memory_stats"),

  clearAll: () => invoke<void>("memory_clear_all"),
};