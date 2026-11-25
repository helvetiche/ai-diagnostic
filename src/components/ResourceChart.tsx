import { useId, type ReactNode } from "react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  useRecharts,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  formatValue: (value: number) => string;
};

export type ChartPoint = {
  sampledAt: number;
  [key: string]: number;
};

type ResourceChartProps = {
  label: string;
  icon?: ReactNode;
  meta?: string;
  metaMono?: boolean;
  value: string;
  data: ChartPoint[];
  series: ChartSeries[];
  emptyMessage: string;
  ariaLabel: string;
  yDomain?: [number | "auto", number | "auto"];
  yTickFormatter?: (value: number) => string;
  renderTooltipFooter?: (sampledAt: number) => React.ReactNode;
  className?: string;
  chartClassName?: string;
};

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

type ResourceTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  series: ChartSeries[];
  renderFooter?: (sampledAt: number) => React.ReactNode;
};

function ResourceTooltip({ active, payload, label, series, renderFooter }: ResourceTooltipProps) {
  const sampledAt = typeof label === "number" ? label : Number(label);
  const footer = renderFooter && Number.isFinite(sampledAt) ? renderFooter(sampledAt) : null;

  return (
    <ChartTooltipContent
      active={active}
      payload={payload}
      label={label}
      className={footer ? "w-56" : undefined}
      labelFormatter={(value) => (typeof value === "number" ? formatClock(value) : value)}
      formatter={(value, dataKey) =>
        series.find((item) => item.key === dataKey)?.formatValue(value) ?? `${value}`
      }
      footer={footer}
    />
  );
}

export function ResourceChart({
  label,
  icon,
  meta,
  metaMono = false,
  value,
  data,
  series,
  emptyMessage,
  ariaLabel,
  yDomain,
  yTickFormatter,
  renderTooltipFooter,
  className,
  chartClassName = "h-32",
}: ResourceChartProps) {
  const uid = useId().replace(/:/g, "");
  const recharts = useRecharts();

  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );

  return (
    <figure className={cn("border border-border-subtle p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <figcaption
            className={cn(
              "flex min-w-0 items-center gap-1.5 truncate text-[12px] leading-5 font-medium text-foreground",
              metaMono && "font-mono",
            )}
          >
            {icon ? (
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                {icon}
              </span>
            ) : null}
            <span className="truncate">{label}</span>
          </figcaption>
          {meta ? (
            <p
              className={cn(
                "truncate text-[11px] leading-4 text-muted-foreground",
                metaMono && "font-mono",
              )}
            >
              {meta}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[15px] leading-6 font-light tabular-nums text-foreground">
            {value}
          </span>
          {series.length > 1 ? (
            <ul className="flex items-center gap-2.5">
              {series.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-1.5 text-[10px] leading-4 text-muted-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-2 shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div className="mt-3">
        {data.length < 2 ? (
          <div
            className={cn(
              "flex items-center justify-center text-[11px] text-muted-foreground",
              chartClassName,
            )}
          >
            {emptyMessage}
          </div>
        ) : recharts ? (
          <ChartContainer
            config={config}
            role="img"
            aria-label={ariaLabel}
            className={cn(chartClassName, "w-full")}
          >
            <recharts.AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
              <defs>
                {series.map((item) => (
                  <linearGradient
                    key={item.key}
                    id={`${uid}-${item.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={item.color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={item.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <recharts.CartesianGrid
                vertical
                stroke="var(--border-subtle)"
                strokeDasharray="3 4"
              />
              <recharts.XAxis
                dataKey="sampledAt"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={false}
                tickLine={false}
                axisLine={false}
                height={4}
              />
              <recharts.YAxis
                domain={yDomain ?? ["auto", "auto"]}
                tickFormatter={yTickFormatter}
                tickLine={false}
                axisLine={false}
                width={34}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<ResourceTooltip series={series} renderFooter={renderTooltipFooter} />}
              />
              {series.map((item) => (
                <recharts.Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stroke={item.color}
                  strokeWidth={1.5}
                  fill={`url(#${uid}-${item.key})`}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </recharts.AreaChart>
          </ChartContainer>
        ) : (
          <div className={cn(chartClassName, "w-full")} />
        )}
      </div>
    </figure>
  );
}
