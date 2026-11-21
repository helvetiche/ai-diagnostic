import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ThermalSample } from "@/types/thermal";

const HISTORY_LIMIT = 300;
const GAP_MS = 10_000;

export type ThermalStreamStatus = "loading" | "live" | "error";

function trimTrailingRun(samples: ThermalSample[]): ThermalSample[] {
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

function appendSample(samples: ThermalSample[], sample: ThermalSample): ThermalSample[] {
  const last = samples.at(-1);

  if (last && sample.sampledAt - last.sampledAt > GAP_MS) {
    return [sample];
  }

  const next = [...samples, sample];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function mergeSamples(history: ThermalSample[], live: ThermalSample[]): ThermalSample[] {
  const byTime = new Map<number, ThermalSample>();

  for (const sample of [...history, ...live]) {
    byTime.set(sample.sampledAt, sample);
  }

  return trimTrailingRun(
    [...byTime.values()].sort((left, right) => left.sampledAt - right.sampledAt),
  );
}

export function useThermalStream() {
  const [samples, setSamples] = useState<ThermalSample[]>([]);
  const [status, setStatus] = useState<ThermalStreamStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function start() {
      setStatus("loading");
      setError(null);

      try {
        const stopListening = await listen<ThermalSample>("thermal:sample", (event) => {
          setSamples((previous) => appendSample(previous, event.payload));
        });

        if (cancelled) {
          stopListening();
          return;
        }

        unlisten = stopListening;

        const history = await invoke<ThermalSample[]>("thermal_history");

        if (cancelled) {
          return;
        }

        setSamples((previous) => mergeSamples(history, previous));
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
    reset: () => {
      setSamples([]);
    },
  };
}
