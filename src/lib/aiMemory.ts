import { invoke } from "@tauri-apps/api/core";

import type {
  AiConversation,
  AiMemoryFact,
  AiMessage,
  MemoryBootstrap,
  MemorySearchHit,
  MemoryStats,
} from "@/types/aiMemory";

/**
 * Emergency kill switch for the whole memory feature.
 * Set to false to run Ask AI fully in memory again.
 */
export const AI_MEMORY_ENABLED = true;

const MEMORY_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, MEMORY_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Every memory call is bounded. A slow or locked database rejects instead of
 * leaving the UI waiting forever, and the caller can fall back to in-memory chat.
 */
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return withTimeout(invoke<T>(command, args), command);
}

export const aiMemory = {
  bootstrap: (options?: {
    contextKey?: string;
    conversationLimit?: number;
    messageLimit?: number;
  }) =>
    call<MemoryBootstrap>("memory_bootstrap", {
      contextKey: options?.contextKey,
      conversationLimit: options?.conversationLimit,
      messageLimit: options?.messageLimit,
    }),

  conversationCreate: (title?: string, contextKey?: string) =>
    call<AiConversation>("memory_conversation_create", { title, contextKey }),

  conversationList: (options?: {
    contextKey?: string;
    limit?: number;
    offset?: number;
    archived?: boolean;
  }) =>
    call<AiConversation[]>("memory_conversation_list", {
      contextKey: options?.contextKey,
      limit: options?.limit,
      offset: options?.offset,
      archived: options?.archived,
    }),

  conversationDelete: (id: string) =>
    call<void>("memory_conversation_delete", { id }),

  conversationRename: (id: string, title: string) =>
    call<void>("memory_conversation_rename", { id, title }),

  messages: (conversationId: string, limit?: number) =>
    call<AiMessage[]>("memory_conversation_messages", { conversationId, limit }),

  turnAppend: (input: {
    conversationId: string;
    userContent: string;
    assistantContent: string;
    model?: string;
    title?: string;
  }) => call<void>("memory_turn_append", input),

  factUpsert: (input: {
    scope?: string;
    key: string;
    value: string;
    source?: AiMemoryFact["source"];
    confidence?: number;
    expiresAt?: number;
    pinned?: boolean;
  }) =>
    call<AiMemoryFact>("memory_fact_upsert", {
      scope: input.scope,
      key: input.key,
      value: input.value,
      source: input.source,
      confidence: input.confidence,
      expiresAt: input.expiresAt,
      pinned: input.pinned,
    }),

  factList: (scope?: string, includeExpired?: boolean) =>
    call<AiMemoryFact[]>("memory_fact_list", { scope, includeExpired }),

  factDelete: (id: string) => call<void>("memory_fact_delete", { id }),

  factClear: (scope?: string) => call<void>("memory_fact_clear", { scope }),

  search: (query: string, limit?: number) =>
    call<MemorySearchHit[]>("memory_search", { query, limit }),

  stats: () => call<MemoryStats>("memory_stats"),

  clearAll: () => call<void>("memory_clear_all"),
};
