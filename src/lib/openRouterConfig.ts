import { useCallback, useEffect, useState } from "react";

export type OpenRouterModel = {
  id: string;
  name: string;
  free: boolean;
};

export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: OpenRouterModel[];
  temperature: number;
  maxTokens: number;
};

const STORAGE_KEY = "windog.openrouter.config.v1";
const CHANGE_EVENT = "windog:openrouter-config";

export const DEFAULT_MODELS: OpenRouterModel[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", free: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", free: false },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", free: true },
];

export const DEFAULT_CONFIG: OpenRouterConfig = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: DEFAULT_MODELS[0].id,
  models: DEFAULT_MODELS,
  temperature: 0.2,
  maxTokens: 1024,
};

function isZeroPrice(value: unknown): boolean {
  return value === 0 || value === "0" || (typeof value === "string" && Number(value) === 0);
}

function parseModel(value: unknown): OpenRouterModel | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const model = value as { id?: unknown; name?: unknown; free?: unknown };
  if (typeof model.id !== "string" || model.id.length === 0) {
    return null;
  }
  const name = typeof model.name === "string" && model.name.length > 0 ? model.name : model.id;
  const looksFree = /(:free\b|\(free\))/i.test(`${model.id} ${name}`);
  return {
    id: model.id,
    name,
    free: model.free === true || looksFree,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function loadConfig(): OpenRouterConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<OpenRouterConfig>;
    const models = Array.isArray(parsed.models)
      ? parsed.models.map(parseModel).filter((model): model is OpenRouterModel => model !== null)
      : DEFAULT_MODELS;
    const model = typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : DEFAULT_CONFIG.model;

    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim().length > 0
          ? parsed.baseUrl.trim()
          : DEFAULT_CONFIG.baseUrl,
      model,
      models: models.length > 0 ? models : DEFAULT_MODELS,
      temperature:
        typeof parsed.temperature === "number" && Number.isFinite(parsed.temperature)
          ? clamp(parsed.temperature, 0, 1)
          : DEFAULT_CONFIG.temperature,
      maxTokens:
        typeof parsed.maxTokens === "number" && Number.isFinite(parsed.maxTokens)
          ? Math.round(clamp(parsed.maxTokens, 64, 8192))
          : DEFAULT_CONFIG.maxTokens,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: OpenRouterConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage can be unavailable (private mode, full quota); keep in-memory state.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useOpenRouterConfig() {
  const [config, setConfigState] = useState<OpenRouterConfig>(() => loadConfig());

  useEffect(() => {
    function sync() {
      setConfigState(loadConfig());
    }

    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setConfig = useCallback((next: OpenRouterConfig) => {
    saveConfig(next);
    setConfigState(next);
  }, []);

  return { config, setConfig } as const;
}

export async function fetchOpenRouterModels(config: OpenRouterConfig): Promise<OpenRouterModel[]> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/models`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: unknown;
      name?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    }>;
  };
  if (!Array.isArray(payload.data)) {
    throw new Error("Unexpected response from OpenRouter");
  }

  return payload.data
    .map((item) =>
      parseModel({
        id: item.id,
        name: item.name,
        free: isZeroPrice(item.pricing?.prompt) && isZeroPrice(item.pricing?.completion),
      }),
    )
    .filter((model): model is OpenRouterModel => model !== null);
}
