import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { OpenRouterFields } from "@/components/OpenRouterSettings";
import { MemoryPanel } from "@/components/MemoryPanel";
import { cn } from "@/lib/utils";

export function OpenRouterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(open);
  const closing = mounted && !open;

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-background/45 backdrop-blur-[2px] ease-soft duration-[500ms]",
          closing ? "animate-out fade-out fill-mode-forwards" : "animate-in fade-in",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="OpenRouter configuration"
        onAnimationEnd={() => {
          if (closing) {
            setMounted(false);
          }
        }}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-border bg-surface/85 shadow-card backdrop-blur-xs ease-soft",
          closing
            ? "animate-out fade-out slide-out-to-right-full fill-mode-forwards duration-[400ms]"
            : "animate-in fade-in slide-in-from-right-full duration-[500ms]",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-[13px] font-medium text-foreground">OpenRouter configuration</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close OpenRouter configuration"
            className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
          >
            <XIcon size={14} weight="fill" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          <OpenRouterFields />
          <p className="mt-5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            OpenRouter · local config
          </p>
          <div className="mt-6 border-t border-border-subtle pt-4">
            <MemoryPanel />
          </div>
        </div>
      </aside>
    </div>
  );
}
