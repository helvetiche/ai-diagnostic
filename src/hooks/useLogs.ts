import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import useSWR from "swr";

import { preloadCache } from "@/lib/preloadCache";
import type { LogsBitlockerVolume, LogsSnapshot } from "@/types/logs";

type Status = "loading" | "ready" | "error";

const swrOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60_000,
};

export function useLogs() {
  const {
    data: snapshot,
    error,
    isLoading,
    mutate: mutateSnapshot,
  } = useSWR<LogsSnapshot>("logs_snapshot", () => invoke<LogsSnapshot>("logs_snapshot"), {
    ...swrOptions,
    fallbackData: preloadCache.logsSnapshot ?? undefined,
  });

  const { data: bitlocker, mutate: mutateBitlocker } = useSWR<LogsBitlockerVolume[]>(
    "logs_bitlocker",
    () => invoke<LogsBitlockerVolume[]>("logs_bitlocker"),
    {
      ...swrOptions,
      fallbackData: preloadCache.logsBitlocker ?? undefined,
    },
  );

  const merged = useMemo<LogsSnapshot | null>(() => {
    if (!snapshot) {
      return null;
    }
    if (!bitlocker || !snapshot.security) {
      return snapshot;
    }
    return { ...snapshot, security: { ...snapshot.security, bitlocker } };
  }, [snapshot, bitlocker]);

  const refresh = useCallback(() => {
    void mutateSnapshot();
    void mutateBitlocker();
  }, [mutateSnapshot, mutateBitlocker]);

  const status: Status = isLoading && !snapshot ? "loading" : error ? "error" : "ready";

  return { snapshot: merged, status, error: error instanceof Error ? error.message : error ? String(error) : null, refresh };
}