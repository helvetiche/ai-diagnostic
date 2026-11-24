import { useState } from "react";
import { useShellStats } from "@/hooks/useShellStats";
import { formatBytes, formatPercent } from "@/lib/format";
import { NAV_ITEMS, type NavChild, type ScreenId } from "@/lib/navigation";
import { setPendingLogSection } from "@/lib/logSection";
import { cn } from "@/lib/utils";

const toKb = (value: number) => `${(Math.max(value, 0) / 1024).toFixed(2)}kb`;

function ShellStats() {
  const { resource } = useShellStats();

  if (!resource) {
    return (
      <div className="ml-auto flex shrink-0 flex-col items-start gap-0.5 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <span className="h-3 w-16 animate-pulse bg-surface-muted" />
          <span className="h-3 w-20 animate-pulse bg-surface-muted" />
        </div>
        <div className="flex items-center gap-3">
          <span className="h-3 w-16 animate-pulse bg-surface-muted" />
          <span className="h-3 w-24 animate-pulse bg-surface-muted" />
        </div>
      </div>
    );
  }

  const gpu = resource.gpus[0] ?? null;
  const { memoryUsed } = resource;
  const { memoryTotal } = resource;

  return (
    <div className="ml-auto flex shrink-0 flex-col items-start gap-0.5 font-mono text-[10px] font-semibold whitespace-nowrap uppercase leading-4 tabular-nums text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          cpu: <span className="text-foreground">{formatPercent(resource.cpu)}</span>
        </span>
        <span>
          mem:{" "}
          <span className="text-foreground">
            {formatBytes(memoryUsed, 0)}/{formatBytes(memoryTotal, 0)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          gpu:{" "}
          <span className="text-foreground">
            {gpu?.usage === null ? "—" : formatPercent(gpu.usage)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-success">↓{toKb(resource.download)}</span>
          <span className="text-[#3b5a78] dark:text-[#9dbcd8]">↑{toKb(resource.upload)}</span>
        </span>
      </div>
    </div>
  );
}

export function TopBar({
  active,
  onSelect,
  onAskAi,
  askAiOpen,
}: {
  active: ScreenId;
  onSelect: (screen: ScreenId) => void;
  onAskAi: () => void;
  askAiOpen: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <header className="glass-bar sticky top-0 z-30">
      <div className="mx-auto flex h-[40px] w-full max-w-[1080px] items-center gap-4 pr-4 pl-0 sm:gap-6 sm:pr-6">
        <div className="flex h-[40px] w-fit shrink-0 border border-border">
          <button
            type="button"
            title="Ask AI"
            aria-label="Ask AI"
            aria-expanded={askAiOpen}
            aria-controls="ask-ai-panel"
            onClick={onAskAi}
            className={cn(
              "ai-control flex h-full w-[6.5rem] items-center justify-center gap-1.5 border-r border-border px-2 font-mono text-[10px] font-semibold tracking-wide whitespace-nowrap transition-colors duration-[120ms] ease-soft sm:w-[7.5rem]",
              askAiOpen ? "bg-primary/15" : "bg-primary/10 hover:bg-primary/15",
            )}
          >
            <span className="ai-sparkle" aria-hidden="true" />
            <span className="ai-label">Ask AI</span>
          </button>
          <nav aria-label="Primary" className="h-full w-fit">
            <ul className="grid h-full w-fit grid-cols-5 divide-x divide-border">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const current = active === item.id;
                const hasChildren = !!item.children?.length;
                const isOpen = open === item.id;

                if (hasChildren) {
                  return (
                    <li
                      key={item.id}
                      className="relative flex"
                      onMouseEnter={() => setOpen(item.id)}
                      onMouseLeave={() => setOpen(null)}
                    >
                      <button
                        type="button"
                        title={item.label}
                        aria-expanded={isOpen}
                        onClick={() => setOpen((value) => (value === item.id ? null : item.id))}
                        className={cn(
                          "flex h-full w-[6.5rem] items-center justify-center gap-1.5 px-2 font-mono text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap transition-colors duration-[120ms] ease-soft sm:w-[7.5rem]",
                          "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
                        )}
                      >
                        <Icon size={13} weight="fill" aria-hidden={true} />
                        <span className="max-sm:sr-only">{item.label}</span>
                      </button>
                      <div
                        className={cn(
                          "absolute left-0 top-full z-40 min-w-[12rem] border border-border bg-surface shadow-card transition-all duration-160 ease-soft",
                          isOpen
                            ? "pointer-events-auto translate-y-0 opacity-100"
                            : "pointer-events-none -translate-y-1 opacity-0",
                        )}
                      >
                        <ul className="flex flex-col">
                          {item.children?.map((child: NavChild) => {
                            const ChildIcon = child.icon;
                            return (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (child.section) {
                                    setPendingLogSection(child.section);
                                  }
                                  onSelect(child.id);
                                  setOpen(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-[11px] transition-colors duration-[120ms] ease-soft hover:bg-surface-muted",
                                  active === child.id ? "text-foreground" : "text-muted-foreground",
                                )}
                              >
                                {ChildIcon ? <ChildIcon size={13} weight="fill" aria-hidden={true} /> : null}
                                {child.label}
                              </button>
                            </li>
                            );
                          })}
                        </ul>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.id} className="flex">
                    <button
                      type="button"
                      title={item.label}
                      aria-current={current ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "flex h-full w-[6.5rem] items-center justify-center gap-1.5 px-2 font-mono text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap transition-colors duration-[120ms] ease-soft sm:w-[7.5rem]",
                        current
                          ? "bg-surface-muted text-foreground"
                          : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon size={13} weight="fill" aria-hidden={true} />
                      <span className="max-sm:sr-only">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <ShellStats />
      </div>
    </header>
  );
}
