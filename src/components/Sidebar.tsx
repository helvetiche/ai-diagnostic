import {
  BugIcon,
  GaugeIcon,
  GraphIcon,
  PowerIcon,
  PrinterIcon,
  RowsIcon,
  ThermometerSimpleIcon,
  WifiHighIcon,
} from "@phosphor-icons/react";

type NavItem = {
  label: string;
  description: string;
  icon: typeof GraphIcon;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Resource Graph",
    description: "System analytics.",
    icon: GraphIcon,
  },
  {
    label: "Thermals",
    description: "CPU and GPU temps.",
    icon: ThermometerSimpleIcon,
  },
  {
    label: "Power",
    description: "Uptime and stop history.",
    icon: PowerIcon,
  },
  {
    label: "Processes",
    description: "Live process list.",
    icon: RowsIcon,
  },
  {
    label: "Performance",
    description: "CPU, memory, disk.",
    icon: GaugeIcon,
  },
  {
    label: "Connectivity",
    description: "Network and DNS.",
    icon: WifiHighIcon,
  },
  {
    label: "Crashes",
    description: "Reliability history.",
    icon: BugIcon,
  },
  {
    label: "Devices",
    description: "Printers and docks.",
    icon: PrinterIcon,
  },
];

type NavButtonProps = NavItem & {
  active: boolean;
  onSelect: () => void;
};

function NavButton({ label, description, icon: Icon, active, onSelect }: NavButtonProps) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={
        active
          ? "glass-item group flex w-full items-center gap-3 px-3 py-2 text-left text-xs leading-4 font-medium text-foreground shadow-item transition-colors duration-[120ms] ease-soft"
          : "group flex w-full items-center gap-3 px-3 py-2 text-left text-xs leading-4 font-medium text-muted-foreground transition-colors duration-[120ms] ease-soft hover:bg-sidebar-active hover:text-foreground"
      }
    >
      <span
        className={
          active
            ? "glass-item flex size-6 shrink-0 items-center justify-center border border-primary text-primary"
            : "flex size-6 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors duration-[120ms] ease-soft group-hover:text-foreground"
        }
      >
        <Icon size={16} weight={active ? "fill" : "regular"} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        <span className="-mt-1 font-mono text-[10px] leading-3.5 font-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

export function Sidebar({
  activeLabel,
  onSelect,
}: {
  activeLabel: string;
  onSelect: (label: string) => void;
}) {
  return (
    <aside className="relative z-10 flex h-full w-60 shrink-0 flex-col gap-8 overflow-y-auto bg-sidebar px-3 py-6 shadow-rail">
      <div className="px-3">
        <span className="text-[15px] leading-none font-semibold tracking-[-0.01em] text-foreground">
          windog
        </span>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Workspace
        </p>

        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.label}
            {...item}
            active={item.label === activeLabel}
            onSelect={() => onSelect(item.label)}
          />
        ))}
      </nav>
    </aside>
  );
}
