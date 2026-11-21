import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PowerPlan } from "@/types/configure";

export type PowerPlansStatus = "loading" | "ready" | "error";

export function usePowerPlans() {
  const [plans, setPlans] = useState<PowerPlan[]>([]);
  const [status, setStatus] = useState<PowerPlansStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pendingGuid, setPendingGuid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);

      try {
        const next = await invoke<PowerPlan[]>("list_power_plans");

        if (cancelled) {
          return;
        }

        setPlans(next);
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

  const setActive = useCallback(
    async (guid: string) => {
      setPendingGuid(guid);
      setError(null);

      setPlans((current) =>
        current.map((plan) => ({ ...plan, active: plan.guid === guid })),
      );

      try {
        await invoke("set_power_plan", { guid });
      } catch (error_) {
        setError(error_ instanceof Error ? error_.message : String(error_));
        await refresh();
      } finally {
        setPendingGuid(null);
      }
    },
    [refresh],
  );

  return { plans, status, error, refresh, setActive, pendingGuid };
}
