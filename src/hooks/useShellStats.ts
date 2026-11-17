import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ResourceSample } from "@/types/resources";

/**
 * Keeps only the newest sample for the app shell. History stays with the screens
 * that chart it, so this hook is cheap enough to live above them.
 */
export function useShellStats() {
  const [resource, setResource] = useState<ResourceSample | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopListening: (() => void) | undefined;

    async function subscribe() {
      try {
        const listener = await listen<ResourceSample>("resource:sample", (event) => {
          if (!cancelled) {
            setResource(event.payload);
          }
        });

        if (cancelled) {
          listener();
          return;
        }

        stopListening = listener;
      } catch {
        // The browser preview has no Tauri event bridge.
      }
    }

    void subscribe();

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, []);

  return { resource };
}
