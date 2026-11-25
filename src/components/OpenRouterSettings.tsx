import { ArrowsClockwiseIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { fetchOpenRouterModels, useOpenRouterConfig } from "@/lib/openRouterConfig";

export function OpenRouterFields() {
  const { config, setConfig } = useOpenRouterConfig();
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function refreshModels() {
    setFetching(true);
    setStatus(null);
    try {
      const models = await fetchOpenRouterModels(config);
      setConfig({ ...config, models });
      setStatus(`Loaded ${models.length} models from OpenRouter.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFetching(false);
    }
  }

  const listId = "openrouter-model-options";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3">
        <div className="flex flex-col gap-1.5">
          <span
            id="openrouter-api-key-label"
            className="font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            API key
          </span>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              aria-labelledby="openrouter-api-key-label"
              value={config.apiKey}
              onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
              placeholder="sk-or-…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 border border-border bg-surface-muted px-3 py-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <button
              type="button"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((value) => !value)}
              className="border border-border px-2 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted hover:text-foreground"
            >
              {showKey ? (
                <EyeSlashIcon size={13} aria-hidden="true" />
              ) : (
                <EyeIcon size={13} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Base URL
          </span>
          <input
            type="url"
            value={config.baseUrl}
            onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
            spellCheck={false}
            className="w-full border border-border bg-surface-muted px-3 py-2 font-mono text-[11px] text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="openrouter-model-input"
            className="font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Model
          </label>
          <div className="flex gap-2">
            <input
              id="openrouter-model-input"
              list={listId}
              value={config.model}
              onChange={(event) => setConfig({ ...config, model: event.target.value })}
              spellCheck={false}
              className="min-w-0 flex-1 border border-border bg-surface-muted px-3 py-2 font-mono text-[11px] text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <datalist id={listId}>
              {config.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </datalist>
            <Button type="button" onClick={() => void refreshModels()} disabled={fetching}>
              <ArrowsClockwiseIcon size={12} aria-hidden="true" />
              {fetching ? "Loading" : "Fetch models"}
            </Button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Temperature
            <span className="text-foreground">{config.temperature.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.temperature}
            onChange={(event) => setConfig({ ...config, temperature: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none bg-surface-muted accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Max tokens
          </span>
          <input
            type="number"
            min={64}
            max={8192}
            step={64}
            value={config.maxTokens}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw.trim() === "") {
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) {
                return;
              }
              setConfig({ ...config, maxTokens: parsed });
            }}
            className="w-full border border-border bg-surface-muted px-3 py-2 font-mono text-[11px] text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </label>
      </div>

      <p className={`text-[11px] leading-4 ${status ? "text-critical" : "text-muted-foreground"}`}>
        {status ??
          "Saved locally in this app. The key is sent only to your configured OpenRouter endpoint."}
      </p>
    </div>
  );
}
