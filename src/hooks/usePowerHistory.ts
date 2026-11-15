import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PowerSnapshot } from "@/types/power";

export type PowerHistoryStatus = "loading" | "ready" | "error";

export function usePowerHistory() {
  const [snapshot, setSnapshot] = useState<PowerSnapshot | null>(null);
  const [status, setStatus] = useState<PowerHistoryStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);

      try {
        const next = await invoke<PowerSnapshot>("power_history");

        if (cancelled) {
          return;
        }

        setSnapshot(next);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return { snapshot, status, error, refresh };
}
