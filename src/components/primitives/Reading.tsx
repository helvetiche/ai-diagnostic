import type { ReactNode } from "react";

import { RollingValue } from "@/components/primitives/RollingValue";
import { cn } from "@/lib/utils";

export function Reading({
  label,
  value,
  unit,
  hint,
  status,
  icon,
  size = "default",
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  size?: "default" | "compact" | "hero";
  tone?: "default" | "warning" | "critical";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 font-medium text-muted-foreground">
          {icon ? (
            <span aria-hidden="true" className="shrink-0">
              {icon}
            </span>
          ) : null}
          <span className="truncate">{label}</span>
        </p>
        {status ? <div className="shrink-0 text-right leading-4">{status}</div> : null}
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono font-light tabular-nums",
            size === "hero"
              ? "text-[44px] leading-none"
              : size === "compact"
                ? "text-[20px] leading-none"
                : "text-[30px] leading-none",
            tone === "warning" && "text-warning",
            tone === "critical" && "text-critical",
            tone === "default" && "text-foreground",
          )}
        >
          <RollingValue value={value} />
        </span>
        {unit ? (
          <span className="text-[11px] leading-4 font-medium text-muted-foreground">{unit}</span>
        ) : null}
      </p>
      {hint ? (
        <p className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
