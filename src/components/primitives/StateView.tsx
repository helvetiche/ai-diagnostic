import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StateView({
  title,
  code,
  action,
  tone = "muted",
  className,
}: {
  title: string;
  code?: string | null;
  action?: ReactNode;
  tone?: "muted" | "critical";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-panel border border-border-subtle bg-surface px-6 py-8 shadow-card sm:px-8 sm:py-10",
        className,
      )}
      aria-live={tone === "critical" ? "assertive" : "polite"}
    >
      <h2
        className={cn(
          "text-[15px] font-medium",
          tone === "critical" ? "text-critical" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {code ? (
        <p className="mt-4 max-w-xl rounded-control bg-surface-muted px-3 py-2 font-mono text-[11px] leading-5 break-words text-muted-foreground">
          {code}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
