import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  className,
  tone = "solid",
  ...props
}: ComponentProps<"section"> & { tone?: "solid" | "glass" }) {
  return (
    <section
      className={cn(
        "rounded-panel",
        tone === "glass"
          ? "glass-panel"
          : "border border-border-subtle bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  meta,
  action,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4",
        className,
      )}
    >
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      <div className="flex items-center gap-3">
        {meta ? <span className="text-[11px] text-muted-foreground">{meta}</span> : null}
        {action}
      </div>
    </header>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pt-3 pb-5", className)} {...props} />;
}
