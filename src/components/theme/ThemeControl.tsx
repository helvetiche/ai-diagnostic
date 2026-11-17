import { useEffect, useRef, useState } from "react";
import { CheckIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

import { Button } from "@/components/primitives/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { ACCENTS, THEME_MODES } from "@/theme/theme";
import { cn } from "@/lib/utils";

export function ThemeControl() {
  const { mode, accent, dark, setMode, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={dark ? "Appearance, dark theme" : "Appearance, light theme"}
        onClick={() => setOpen((current) => !current)}
      >
        {dark ? <MoonIcon size={18} aria-hidden="true" /> : <SunIcon size={18} aria-hidden="true" />}
      </Button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Appearance"
          tabIndex={-1}
          className="pop-enter glass absolute top-full right-0 z-50 mt-2 w-[264px] rounded-panel p-3 outline-none"
        >
          <p className="px-1 text-[11px] font-medium text-muted-foreground">Appearance</p>
          <div
            className="mt-2 grid grid-cols-3 gap-1 rounded-control bg-surface-muted/70 p-1"
            role="group"
            aria-label="Appearance mode"
          >
            {THEME_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
                className={cn(
                  "h-8 rounded-mark text-[12px] font-medium transition-[background-color,color,box-shadow] duration-[140ms] ease-soft",
                  mode === item.id
                    ? "bg-surface text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="mt-4 px-1 text-[11px] font-medium text-muted-foreground">Accent</p>
          <div className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label="Accent color">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={accent === item.id}
                onClick={() => setAccent(item.id)}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-control px-2 text-left text-[12px] font-medium transition-colors duration-[120ms] ease-soft",
                  accent === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-full border border-black/5 dark:border-white/10"
                  style={{ backgroundColor: dark ? item.swatch.dark : item.swatch.light }}
                />
                <span className="flex-1">{item.label}</span>
                {accent === item.id ? (
                  <CheckIcon size={14} aria-hidden="true" className="text-primary" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
