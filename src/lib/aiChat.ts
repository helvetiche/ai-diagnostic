import type { OpenRouterConfig } from "@/lib/openRouterConfig";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * One turn in, one complete reply out.
 *
 * This uses the browser fetch API (the same path the web build uses) instead of
 * a Tauri command. No IPC, no Rust thread, no main-thread work: the window keeps
 * rendering while the model is thinking.
 */
export async function requestChatReply(
  config: OpenRouterConfig,
  messages: ChatTurn[],
): Promise<string> {
  if (!config.apiKey.trim()) {
    throw new Error("Add your OpenRouter API key in Configure OpenRouter first.");
  }

  const base = config.baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://windog.ai",
        "X-Title": "Windog",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenRouter returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenRouter returned an empty reply.");
    }

    return content.trim();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
