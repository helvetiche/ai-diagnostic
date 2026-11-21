import { useShellStats } from "@/hooks/useShellStats";
import { formatBytes, formatPercent } from "@/lib/format";
import { NAV_ITEMS, type ScreenId } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const toKb = (value: number) => `${(Math.max(value, 0) / 1024).toFixed(2)}kb`;

function ShellStats() {
  const { resource } = useShellStats();

  if (!resource) {
    return (
      <div className="ml-auto flex flex-col items-start gap-0.5">
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
    <div className="ml-auto flex flex-col items-start gap-0.5 font-mono text-[10px] font-semibold uppercase leading-4 tabular-nums text-muted-foreground">
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
}: {
  active: ScreenId;
  onSelect: (screen: ScreenId) => void;
}) {
  return (
    <header className="glass-bar sticky top-0 z-30">
      <div className="mx-auto flex h-[40px] w-full max-w-[1080px] items-center gap-4 pl-0 pr-4 sm:gap-6 sm:pr-6">
        <nav aria-label="Primary" className="w-fit">
          <ul className="grid h-[40px] w-fit grid-cols-5 divide-x divide-border border border-border">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const current = active === item.id;

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
                    <Icon size={13} weight="fill" aria-hidden="true" />
                    <span className="max-sm:sr-only">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <ShellStats />
      </div>
    </header>
  );
}
