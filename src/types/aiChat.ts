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
