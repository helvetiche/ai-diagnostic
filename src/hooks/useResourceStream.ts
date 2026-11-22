import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ResourceSample } from "@/types/resources";

import { preloadCache } from "@/lib/preloadCache";

const HISTORY_LIMIT = 120;
const GAP_MS = 5000;

export type ResourceStreamStatus = "loading" | "live" | "paused" | "error";

function trimTrailingRun(samples: ResourceSample[]): ResourceSample[] {
  let start = 0;

  for (let index = samples.length - 1; index > 0; index -= 1) {
    if (samples[index].sampledAt - samples[index - 1].sampledAt > GAP_MS) {
      start = index;
      break;
    }
  }

  const run = samples.slice(start);
  return run.length > HISTORY_LIMIT ? run.slice(run.length - HISTORY_LIMIT) : run;
}

function appendSample(samples: ResourceSample[], sample: ResourceSample): ResourceSample[] {
  const last = samples.at(-1);

  if (last && sample.sampledAt - last.sampledAt > GAP_MS) {
    return [sample];
  }

  const next = [...samples, sample];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export function useResourceStream() {
  const cachedSamples = preloadCache.resourceSamples;
  const [samples, setSamples] = useState<ResourceSample[]>(() => cachedSamples ?? []);
  const [status, setStatus] = useState<ResourceStreamStatus>(() =>
    cachedSamples && cachedSamples.length > 0 ? "live" : "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function start() {
      if (!(preloadCache.resourceSamples && preloadCache.resourceSamples.length > 0)) {
        setStatus("loading");
      }
      setError(null);

      try {
        const stopListening = await listen<ResourceSample>("resource:sample", (event) => {
          setSamples((previous) => appendSample(previous, event.payload));
        });

        if (cancelled) {
          stopListening();
          return;
        }

        unlisten = stopListening;

        const history = await invoke<ResourceSample[]>("resource_history");

        if (cancelled) {
          return;
        }

        setSamples((previous) => trimTrailingRun([...history, ...previous]));
        setStatus("live");
      } catch (error_) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(error_ instanceof Error ? error_.message : String(error_));
      }
    }

    void start();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [attempt]);

  return {
    samples,
    status,
    error,
    retry: () => {
      setAttempt((current) => current + 1);
    },
  };
}
