import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PowerTimeouts } from "@/types/configure";

export type PowerSettingsStatus = "loading" | "ready" | "error";

export function usePowerSettings() {
  const [timeouts, setTimeouts] = useState<PowerTimeouts | null>(null);
  const [fastStartup, setFastStartupState] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PowerSettingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [savingTimeouts, setSavingTimeouts] = useState(false);
  const [savingFastStartup, setSavingFastStartup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);

      try {
        const [nextTimeouts, nextFastStartup] = await Promise.all([
          invoke<PowerTimeouts>("get_power_timeouts"),
          invoke<boolean | null>("get_fast_startup"),
        ]);

        if (cancelled) {
          return;
        }

        setTimeouts(nextTimeouts);
        setFastStartupState(nextFastStartup);
        setStatus("ready");
      } catch (error_) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(error_ instanceof Error ? error_.message : String(error_));
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

  const saveTimeouts = useCallback(async (next: PowerTimeouts) => {
    setSavingTimeouts(true);
    setError(null);

    try {
      await invoke("set_power_timeouts", { timeouts: next });
      setTimeouts(next);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setSavingTimeouts(false);
    }
  }, []);

  const setFastStartup = useCallback(async (enabled: boolean) => {
    setSavingFastStartup(true);
    setError(null);

    try {
      await invoke("set_fast_startup", { enabled });
      setFastStartupState(enabled);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setSavingFastStartup(false);
    }
  }, []);

  return {
    timeouts,
    fastStartup,
    status,
    error,
    refresh,
    saveTimeouts,
    setFastStartup,
    savingTimeouts,
    savingFastStartup,
  };
}
