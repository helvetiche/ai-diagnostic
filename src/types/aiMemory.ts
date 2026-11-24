export type AiConversation = {
  id: string;
  title: string;
  contextKey: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export type AiMessage = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  model: string | null;
  tokens: number | null;
  createdAt: number;
};

export type AiMemoryFact = {
  id: string;
  key: string;
  value: string;
  scope: string;
  source: "observed" | "user" | "ai-suggested";
  confidence: number | null;
  observedAt: number;
  expiresAt: number | null;
  pinned: boolean;
};

export type MemorySearchHit = {
  entityType: string;
  entityId: string;
  title: string;
  snippet: string;
  rank: number;
};

export type MemoryStats = {
  conversations: number;
  messages: number;
  facts: number;
  indexEntries: number;
};