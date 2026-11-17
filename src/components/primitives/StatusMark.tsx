import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MarkTone = "muted" | "primary" | "success" | "warning" | "critical" | "info";

const TONE_TEXT: Record<MarkTone, string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  critical: "text-critical",
  info: "text-info",
};

const TONE_MARK: Record<MarkTone, string> = {
  muted: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  info: "bg-info",
};

export function StatusMark({
  tone = "muted",
  labelTone = false,
  children,
  className,
}: {
  tone?: MarkTone;
  labelTone?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        labelTone ? TONE_TEXT[tone] : "text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_MARK[tone])} />
      {children}
    </span>
  );
}
