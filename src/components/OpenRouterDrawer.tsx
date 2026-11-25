import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import { OpenRouterFields } from "@/components/OpenRouterSettings";
import { MemoryPanel } from "@/components/MemoryPanel";
import { AI_MEMORY_ENABLED } from "@/lib/aiMemory";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 500;

export function OpenRouterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (!dialog.open) {
      return;
    }

    // Fallback for reduced-motion environments where animationend never fires.
    const timer = window.setTimeout(() => dialog.close(), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="OpenRouter configuration"
      onCancel={(event) => {
        // Keep the native dialog open so the closing animation can play.
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-40 m-0 h-full w-full max-w-none overflow-hidden border-0 bg-transparent p-0"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-background/45 backdrop-blur-[2px] ease-soft duration-[500ms]",
          open ? "animate-in fade-in" : "animate-out fade-out fill-mode-forwards",
        )}
      />

      <div
        onAnimationEnd={() => {
          if (!open) {
            dialogRef.current?.close();
          }
        }}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-card ease-soft",
          open
            ? "animate-in fade-in slide-in-from-right-full duration-[500ms]"
            : "animate-out fade-out slide-out-to-right-full fill-mode-forwards duration-[400ms]",
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
          {open && AI_MEMORY_ENABLED ? (
            <div className="mt-6 border-t border-border-subtle pt-4">
              <MemoryPanel />
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
