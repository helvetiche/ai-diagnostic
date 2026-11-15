import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProcessListSample, ProcessSample } from "@/types/processes";

export type ProcessStreamStatus = "loading" | "live" | "paused" | "error";

export type ProcessHistoryPoint = {
  sampledAt: number;
  cpu: number;
  memory: number;
  gpu: number | null;
};

const HISTORY_LIMIT = 30;
const POLL_INTERVAL = 1000;

export function useProcesses() {
  const [processes, setProcesses] = useState<ProcessSample[]>([]);
  const [sampledAt, setSampledAt] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStreamStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<Record<number, ProcessHistoryPoint[]>>({});
  useEffect(() => {
    let cancelled = false;

    function applySample(list: ProcessSample[], at: number) {
      if (cancelled) {
        return;
      }

      setProcesses(list);
      setSampledAt(at);
      setStatus("live");
      setError(null);

      setHistory((previous) => {
        const next: Record<number, ProcessHistoryPoint[]> = { ...previous };
        for (const process of list) {
          const points = next[process.pid] ? [...next[process.pid]] : [];
          points.push({
            sampledAt: at,
            cpu: process.cpu,
            memory: process.memory,
            gpu: process.gpu,
          });
          if (points.length > HISTORY_LIMIT) {
            points.splice(0, points.length - HISTORY_LIMIT);
          }
          next[process.pid] = points;
        }
        return next;
      });
    }

    async function refresh() {
      try {
        const list = await invoke<ProcessSample[]>("get_processes");
        applySample(list, Date.now());
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }

    void refresh();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refresh();
    }, POLL_INTERVAL);

    let unlisten: (() => void) | undefined;
    void listen<ProcessListSample>("processes:sample", (event) => {
      applySample(event.payload.processes, event.payload.sampledAt);
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {
        // Events are optional; the poll above is the fallback.
      });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unlisten?.();
    };
  }, [version]);

  return {
    processes,
    processHistory: history,
    sampledAt,
    status,
    error,
    retry: () => setVersion((current) => current + 1),
  };
}
