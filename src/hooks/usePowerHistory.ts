import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import useSWR from "swr";

import type { PowerSnapshot } from "@/types/power";

export type PowerHistoryStatus = "loading" | "ready" | "error";

const swrOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60_000,
};

export function usePowerHistory() {
  const {
    data: snapshot,
    error,
    isLoading,
    mutate,
  } = useSWR<PowerSnapshot>(
    "power_history",
    () => invoke<PowerSnapshot>("power_history"),
    swrOptions,
  );

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const status: PowerHistoryStatus = isLoading && !snapshot ? "loading" : error ? "error" : "ready";

  return {
    snapshot: snapshot ?? null,
    status,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh,
  };
}
