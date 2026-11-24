import type { OpenRouterConfig } from "@/lib/openRouterConfig";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function streamOpenRouterReply(
  config: OpenRouterConfig,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<void> {
  if (!config.apiKey.trim()) {
    throw new Error("Add your OpenRouter API key in Configure OpenRouter first.");
  }

  const base = config.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Streaming is unavailable in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }

      const payload = line.slice(6).trim();
      if (payload === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: unknown } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content.length > 0) {
          onDelta(content);
        }
      } catch {
        // Ignore keep-alive or malformed chunks; the next one still arrives.
      }
    }
  }
}
