import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { mutate } from "swr";

import { preloadCache } from "@/lib/preloadCache";
import type { LogsBitlockerVolume, LogsSnapshot } from "@/types/logs";
import type { ResourceSample } from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

export type PreloadTaskStatus = "pending" | "running" | "done" | "error";

export type PreloadTask = {
  id: string;
  label: string;
  detail: string;
  status: PreloadTaskStatus;
};

const TIMEOUT_MS = 6000;

function waitWithTimeout(run: () => Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    run(),
    new Promise<void>((_, reject) => {
      window.setTimeout(() => reject(new Error("Timed out")), ms);
    }),
  ]);
}

async function waitForFirstEvent(eventName: string, historyCommand: string): Promise<void> {
  try {
    const history = await invoke<unknown[]>(historyCommand);
    if (Array.isArray(history) && history.length > 0) {
      return;
    }
  } catch {
    // Fall through to the event listener.
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      unlisten?.();
      resolve();
    };

    timer = window.setTimeout(finish, TIMEOUT_MS);

    void listen(eventName, () => {
      finish();
    })
      .then((stop) => {
        unlisten = stop;
        if (settled) {
          stop();
        }
      })
      .catch(() => {
        finish();
      });
  });
}

async function preloadLogs(): Promise<void> {
  const results = await Promise.allSettled([
    invoke<unknown>("logs_snapshot"),
    invoke<unknown>("logs_bitlocker"),
  ]);

  const snapshot = results[0];
  const bitlocker = results[1];

  if (snapshot.status === "fulfilled") {
    mutate("logs_snapshot", snapshot.value, false);
    preloadCache.setLogsSnapshot(snapshot.value as LogsSnapshot);
  }
  if (bitlocker.status === "fulfilled") {
    mutate("logs_bitlocker", bitlocker.value, false);
    preloadCache.setLogsBitlocker(bitlocker.value as LogsBitlockerVolume[]);
  }

  if (snapshot.status === "rejected") {
    throw snapshot.reason;
  }
}

const INITIAL_TASKS: PreloadTask[] = [
  {
    id: "logs",
    label: "System logs",
    detail: "Reliability records, events, devices, storage",
    status: "running",
  },
  {
    id: "resources",
    label: "Resource samples",
    detail: "CPU, memory, GPU, disk, network",
    status: "running",
  },
  {
    id: "thermals",
    label: "Thermal sensors",
    detail: "CPU and GPU temperatures",
    status: "running",
  },
];

export function usePreload() {
  const [tasks, setTasks] = useState<PreloadTask[]>(INITIAL_TASKS);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void invoke("set_resource_streaming", { streaming: true }).catch(() => {
      // The sampler is not reachable in a plain browser tab.
    });

    const runners: Array<{ id: string; run: () => Promise<void> }> = [
      { id: "logs", run: () => waitWithTimeout(preloadLogs, 30_000) },
      {
        id: "resources",
        run: async () => {
          await waitWithTimeout(() => waitForFirstEvent("resource:sample", "resource_history"), 15_000);
          try {
            const history = await invoke<ResourceSample[]>("resource_history");
            preloadCache.setResourceSamples(history);
          } catch {
            // Keep whatever was already cached.
          }
        },
      },
      {
        id: "thermals",
        run: async () => {
          await waitWithTimeout(() => waitForFirstEvent("thermal:sample", "thermal_history"), 15_000);
          try {
            const history = await invoke<ThermalSample[]>("thermal_history");
            preloadCache.setThermalSamples(history);
          } catch {
            // Keep whatever was already cached.
          }
        },
      },
    ];

    const timers: number[] = [];
    const startedAt = Date.now();

    // Progress climbs continuously instead of jumping between fixed values.
    const progressTimer = window.setInterval(() => {
      if (cancelled) {
        return;
      }
      const elapsed = Date.now() - startedAt;
      const next = Math.min(0.9, elapsed / 5000);
      setProgress(next);
    }, 50);
    timers.push(progressTimer);

    void Promise.allSettled(
      runners.map(async ({ id, run }) => {
        try {
          await run();
          if (cancelled) {
            return;
          }
          setTasks((previous) =>
            previous.map((task) => (task.id === id ? { ...task, status: "done" } : task)),
          );
        } catch {
          if (cancelled) {
            return;
          }
          setTasks((previous) =>
            previous.map((task) => (task.id === id ? { ...task, status: "error" } : task)),
          );
        }
      }),
    ).then(() => {
      if (cancelled) {
        return;
      }

      const elapsed = Date.now() - startedAt;
      const waitBeforeFinish = Math.max(0, 3000 - elapsed);

      const finishTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        window.clearInterval(progressTimer);
        setProgress(1);
        const readyTimer = window.setTimeout(() => {
          if (!cancelled) {
            setReady(true);
          }
        }, 1500);
        timers.push(readyTimer);
      }, waitBeforeFinish);
      timers.push(finishTimer);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return { ready, tasks, progress };
}