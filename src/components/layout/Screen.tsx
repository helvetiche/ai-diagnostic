import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <h1 className="min-w-0 text-[26px] leading-9 font-medium tracking-[-0.03em] text-foreground">
        {title}
      </h1>
      {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
    </header>
  );
}
