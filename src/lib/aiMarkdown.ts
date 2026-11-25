import { invoke } from "@tauri-apps/api/core";

import type { AiMessage } from "@/types/aiMemory";

export function conversationToMarkdown(messages: AiMessage[]): string {
  const entries = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const label = message.role === "user" ? "You" : "Windog AI";
      const model = message.role === "assistant" && message.model ? ` · ${message.model}` : "";
      return `## ${label}${model}\n\n${message.content.trim()}`;
    });

  return ["# Windog AI conversation", "", ...entries].join("\n\n");
}

export function saveConversationMarkdown(messages: AiMessage[]): Promise<string> {
  const content = conversationToMarkdown(messages);
  return invoke<string>("save_markdown", { title: "Windog AI conversation", content });
}
