import * as React from "react";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

function importRecharts() {
  return import("recharts");
}

type RechartsModule = Awaited<ReturnType<typeof importRecharts>>;

let rechartsPromise: Promise<RechartsModule> | undefined;

function loadRecharts(): Promise<RechartsModule> {
  rechartsPromise ??= importRecharts();
  return rechartsPromise;
}

/** Load recharts on first chart mount instead of shipping it in the entry chunk. */
export function useRecharts(): RechartsModule | null {
  const [recharts, setRecharts] = React.useState<RechartsModule | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadRecharts().then((module) => {
      if (active) {
        setRecharts(module);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return recharts;
}

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used inside a ChartContainer");
  }

  return context;
}

function ChartContainer({
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ config }), [config]);
  const recharts = useRecharts();

  return (
    <ChartContext.Provider value={value}>
      <div
        data-slot="chart"
        className={cn(
          "flex justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border-subtle",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-layer]:outline-hidden",
          "[&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        {recharts ? <recharts.ResponsiveContainer>{children}</recharts.ResponsiveContainer> : null}
      </div>
    </ChartContext.Provider>
  );
}

type ChartTooltipProps = React.ComponentProps<RechartsModule["Tooltip"]>;

function ChartTooltip(props: ChartTooltipProps) {
  const recharts = useRecharts();
  return recharts ? <recharts.Tooltip {...props} /> : null;
}

type ChartTooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string | number;
  hideLabel?: boolean;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  formatter?: (value: number, dataKey: string) => React.ReactNode;
  footer?: React.ReactNode;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  labelFormatter,
  formatter,
  footer,
  className,
  ...props
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "glass grid min-w-36 gap-1.5 rounded-control px-3 py-2 text-xs text-popover-foreground",
        className,
      )}
      {...props}
    >
      {hideLabel ? null : (
        <div className="font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}

      <div className="grid gap-1">
        {payload.map((item) => {
          const dataKey = String(item.dataKey ?? item.name ?? "value");
          const itemConfig = config[dataKey];
          const numericValue = typeof item.value === "number" ? item.value : Number(item.value);

          return (
            <div key={dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color ?? itemConfig?.color }}
                />
                {itemConfig?.label ?? item.name ?? dataKey}
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {formatter && Number.isFinite(numericValue)
                  ? formatter(numericValue, dataKey)
                  : item.value}
              </span>
            </div>
          );
        })}
      </div>

      {footer ? <div className="border-t border-border-subtle pt-1.5">{footer}</div> : null}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
