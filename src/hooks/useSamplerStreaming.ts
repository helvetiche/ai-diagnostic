import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Keeps the Rust sampler running while the window is visible. This lives at the
 * app root so switching screens never pauses sampling for the other screens.
 */
export function useSamplerStreaming() {
  useEffect(() => {
    function syncStreaming() {
      const hidden = document.visibilityState === "hidden";

      void invoke("set_resource_streaming", { streaming: !hidden }).catch(() => {
        // The sampler is not reachable in a plain browser tab.
      });
    }

    syncStreaming();
    document.addEventListener("visibilitychange", syncStreaming);

    return () => {
      document.removeEventListener("visibilitychange", syncStreaming);
      void invoke("set_resource_streaming", { streaming: false }).catch(() => {
        // The window is closing or the sampler never started.
      });
    };
  }, []);
}
