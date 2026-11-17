import { useId, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";

import { Panel } from "@/components/primitives/Panel";
import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  action,
  children,
  defaultOpen = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Panel>
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-10 flex-1 items-center justify-between gap-3 rounded-control text-left transition-colors duration-[120ms] ease-soft hover:text-foreground"
        >
          <span className="text-[13px] font-medium text-foreground">{title}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {open ? "Hide" : "Show"}
            <CaretDownIcon
              size={12}
              aria-hidden="true"
              className={cn("transition-transform duration-200 ease-soft", open && "rotate-180")}
            />
          </span>
        </button>
        {action}
      </div>

      <div id={contentId} className="disclosure" data-open={open} inert={!open}>
        <div>
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </Panel>
  );
}
