import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { loadLevel } from "@/lib/loadLevel";

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

type ChartMeter = {
  value: number | null;
  label?: string;
};

type ResourceChartProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  data: ChartPoint[];
  series: ChartSeries[];
  emptyMessage: string;
  ariaLabel: string;
  yDomain?: [number | "auto", number | "auto"];
  yTickFormatter?: (value: number) => string;
  renderTooltipFooter?: (sampledAt: number) => React.ReactNode;
  meter?: ChartMeter;
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
  const footer =
    renderFooter && Number.isFinite(sampledAt) ? renderFooter(sampledAt) : null;

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

function LoadMeter({ title, label, value }: { title: string; label: string; value: number }) {
  const level = loadLevel(value);
  const percent = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] leading-4 tabular-nums text-foreground">
            {formatPercent(value)}
          </span>
          <span
            className={`px-1.5 py-0.5 text-[11px] leading-4 font-medium ${level.badgeClassName}`}
          >
            {level.label}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${title} ${label.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="mt-1.5 h-2 w-full bg-surface-muted"
      >
        <div
          aria-hidden="true"
          className={`h-full transition-[width] duration-300 ease-soft ${level.barClassName}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ResourceChart({
  title,
  icon,
  data,
  series,
  emptyMessage,
  ariaLabel,
  yDomain,
  yTickFormatter,
  renderTooltipFooter,
  meter,
  className,
  chartClassName = "h-56",
}: ResourceChartProps) {
  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );

  return (
    <figure className={cn("bg-surface p-5 border border-border", className)}>
      <header className="border border-border px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {icon ? <span className="text-muted-foreground">{icon}</span> : null}
            <span className="font-mono text-xs font-medium text-foreground">{title}</span>
          </div>

          <ul className="flex flex-wrap items-center gap-3 text-[11px] leading-4 font-medium text-muted-foreground">
            {series.map((item) => (
              <li key={item.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        {meter && meter.value !== null ? (
          <LoadMeter
            title={title}
            label={meter.label ?? "Load"}
            value={meter.value}
          />
        ) : null}
      </header>

      <div className="mt-4">
        {data.length < 2 ? (
          <div className="flex h-56 items-center justify-center bg-surface-muted px-4 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <ChartContainer config={config} className={cn(chartClassName, "w-full")} aria-label={ariaLabel}>
            <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="sampledAt"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatClock}
                tickLine={false}
                axisLine={false}
                minTickGap={56}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                domain={yDomain ?? ["auto", "auto"]}
                tickFormatter={yTickFormatter}
                tickLine={false}
                axisLine={false}
                width={46}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={<ResourceTooltip series={series} renderFooter={renderTooltipFooter} />}
              />
              {series.map((item) => (
                <Area
                  key={item.key}
                  type="linear"
                  dataKey={item.key}
                  stroke={item.color}
                  strokeWidth={2}
                  fill={item.color}
                  fillOpacity={0.12}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </figure>
  );
}
