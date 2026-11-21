import { useMemo } from "react";
import { CpuIcon, GraphicsCardIcon, MemoryIcon, PlugsConnectedIcon } from "@phosphor-icons/react";

import { Screen } from "@/components/layout/Screen";
import { Meter, type MeterTone } from "@/components/primitives/Meter";
import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { Vitals } from "@/components/Vitals";
import { ResourceChart, type ChartPoint, type ChartSeries } from "@/components/ResourceChart";
import { Button } from "@/components/primitives/Button";
import { useResourceStream } from "@/hooks/useResourceStream";
import { useThermalStream } from "@/hooks/useThermalStream";
import { formatBytes, formatPercent, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DiskSample, ResourceSample, TopNetworkProcess, TopProcess } from "@/types/resources";

function TooltipProcessRow({
  name,
  value,
  emphasis = false,
}: {
  name: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="truncate text-[11px] text-muted-foreground">{name}</span>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums",
          emphasis ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TopProcessSection({
  title,
  processes,
  metric,
  memoryTotal,
}: {
  title: string;
  processes: TopProcess[];
  metric: "cpu" | "memory" | "gpu";
  memoryTotal: number;
}) {
  function processPercent(process: TopProcess): number {
    if (metric === "memory") {
      return memoryTotal > 0 ? (process.memory / memoryTotal) * 100 : 0;
    }
    if (metric === "gpu") {
      return process.gpu ?? 0;
    }
    return process.cpu;
  }

  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
      {processes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No activity</p>
      ) : (
        processes.map((process) => (
          <TooltipProcessRow
            key={process.name}
            name={process.name}
            value={
              metric === "memory"
                ? formatBytes(process.memory)
                : formatPercent(processPercent(process))
            }
          />
        ))
      )}
    </div>
  );
}

function TopProcessFooter({
  sample,
  metric,
}: {
  sample: ResourceSample;
  metric: "cpu" | "memory" | "gpu";
}) {
  const processes =
    metric === "cpu" ? sample.topCpu : metric === "memory" ? sample.topMemory : sample.topGpu;

  return (
    <TopProcessSection
      title={metric === "memory" ? "Top memory" : metric === "gpu" ? "Top GPU" : "Top CPU"}
      processes={processes ?? []}
      metric={metric}
      memoryTotal={sample.memoryTotal}
    />
  );
}

function NetworkSection({ title, processes }: { title: string; processes: TopNetworkProcess[] }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
      {processes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No activity</p>
      ) : (
        processes.map((process) => (
          <TooltipProcessRow
            key={process.name}
            name={process.name}
            value={formatRate(process.rate)}
          />
        ))
      )}
    </div>
  );
}

function NetworkFooter({ sample }: { sample: ResourceSample }) {
  if (!sample.networkAttribution) {
    return (
      <div className="grid gap-1">
        <p className="text-[10px] font-medium text-muted-foreground">Per-app network</p>
        <p className="text-[11px] leading-4 text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <NetworkSection title="Top download" processes={sample.topDownload ?? []} />
      <NetworkSection title="Top upload" processes={sample.topUpload ?? []} />
    </div>
  );
}

function VolumeRow({ disk }: { disk: DiskSample }) {
  const used = disk.total > 0 ? ((disk.total - disk.available) / disk.total) * 100 : 0;
  const tone: MeterTone = used >= 90 ? "critical" : used >= 80 ? "warning" : "success";
  const note = used >= 90 ? "Almost full" : used >= 80 ? "Low space" : null;

  return (
    <li className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[12px] font-medium text-foreground">{disk.name}</span>
          {disk.removable ? (
            <span className="text-[10px] text-muted-foreground">Removable</span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {disk.mount} Â· {disk.kind}
        </span>
      </div>

      <Meter className="mt-2" label={`${disk.name} space used`} value={used} tone={tone} />

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">
          {formatBytes(disk.available)} free of {formatBytes(disk.total)}
        </span>
        <span className={tone === "critical" ? "text-critical" : "text-muted-foreground"}>
          {formatPercent(used)} used{note ? ` Â· ${note}` : ""}
        </span>
      </div>
    </li>
  );
}

function StoragePanel({ disks }: { disks: DiskSample[] }) {
  if (disks.length === 0) {
    return (
      <ul
        className="grid divide-x divide-y divide-border-subtle border border-border"
        style={{ gridTemplateColumns: "repeat(1, minmax(0, 1fr))" }}
      >
        <li className="p-4 text-[11px] text-muted-foreground">No volumes found.</li>
      </ul>
    );
  }

  return (
    <ul
      className="grid divide-x divide-y divide-border-subtle border border-border"
      style={{ gridTemplateColumns: `repeat(${Math.min(disks.length, 3)}, minmax(0, 1fr))` }}
    >
      {disks.map((disk) => (
        <VolumeRow key={`${disk.mount}-${disk.name}`} disk={disk} />
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <Screen>
      <div
        aria-busy="true"
        className="grid grid-cols-4 divide-x divide-border-subtle border border-border [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-3 [&>div]:p-3 sm:[&>div]:p-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="mt-2 h-1.5 w-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      <div aria-busy="true" className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border border-border-subtle p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="mt-3 h-32 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading resource samples</span>
    </Screen>
  );
}

export function ResourceGraph() {
  const { samples, status, error, retry } = useResourceStream();
  const { samples: thermalSamples } = useThermalStream();
  const latest = samples.at(-1) ?? null;
  const thermalLatest = thermalSamples.at(-1) ?? null;

  const sampleByTime = useMemo(
    () => new Map(samples.map((sample) => [sample.sampledAt, sample])),
    [samples],
  );

  /*
   * The sampler ticks once per second, which crams 120 points into a 32px-tall
   * chart. Chart the last point of each bucket instead, capped near 40 points.
   */
  const chartSamples = useMemo(() => {
    const target = 40;

    if (samples.length <= target) {
      return samples;
    }

    const step = Math.ceil(samples.length / target);
    const reduced = samples.filter((_, index) => index % step === 0);
    const last = samples.at(-1);

    if (last && reduced.at(-1) !== last) {
      reduced.push(last);
    }

    return reduced;
  }, [samples]);

  const cpuPoints = useMemo<ChartPoint[]>(
    () => chartSamples.map((sample) => ({ sampledAt: sample.sampledAt, cpu: sample.cpu })),
    [chartSamples],
  );

  const memoryPoints = useMemo<ChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        sampledAt: sample.sampledAt,
        memory: sample.memoryTotal > 0 ? (sample.memoryUsed / sample.memoryTotal) * 100 : 0,
      })),
    [chartSamples],
  );

  const networkPoints = useMemo<ChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        sampledAt: sample.sampledAt,
        download: sample.download,
        upload: sample.upload,
      })),
    [chartSamples],
  );

  const gpuPoints = useMemo<ChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        sampledAt: sample.sampledAt,
        usage: sample.gpus[0]?.usage ?? 0,
      })),
    [chartSamples],
  );

  const cpuSeries: ChartSeries[] = [
    { key: "cpu", label: "CPU", color: "var(--chart-1)", formatValue: formatPercent },
  ];

  const memorySeries: ChartSeries[] = [
    { key: "memory", label: "Memory", color: "var(--chart-2)", formatValue: formatPercent },
  ];

  const networkSeries: ChartSeries[] = [
    {
      key: "download",
      label: "Download",
      color: "var(--chart-download)",
      formatValue: formatRate,
    },
    { key: "upload", label: "Upload", color: "var(--chart-upload)", formatValue: formatRate },
  ];

  const gpuSeries: ChartSeries[] = [
    { key: "usage", label: "Usage", color: "var(--chart-1)", formatValue: formatPercent },
  ];

  if (status === "error" && samples.length === 0) {
    return (
      <Screen>
        <StateView
          title="Sampler unavailable"
          code={error ?? "Unknown error"}
          action={
            <Button variant="primary" onClick={retry}>
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }

  if (status === "loading" && samples.length === 0) {
    return <OverviewSkeleton />;
  }

  if (!latest) {
    return (
      <Screen>
        <StateView title="No sample yet" />
      </Screen>
    );
  }

  const memoryPercent = latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
  const gpu = latest.gpus[0] ?? null;

  return (
    <Screen>
      <Vitals latest={latest} thermal={thermalLatest} />

      <div className="grid gap-4 md:grid-cols-2">
        <ResourceChart
          label="CPU"
          icon={<CpuIcon size={13} />}
          meta={latest.cpuBrand}
          metaMono
          value={formatPercent(latest.cpu)}
          data={cpuPoints}
          series={cpuSeries}
          emptyMessage="Collecting samples"
          ariaLabel={`CPU usage over the last ${samples.length} seconds`}
          yDomain={[0, 100]}
          yTickFormatter={formatPercent}
          renderTooltipFooter={(sampledAt) => {
            const sample = sampleByTime.get(sampledAt);
            return sample ? <TopProcessFooter sample={sample} metric="cpu" /> : null;
          }}
        />

        {gpu ? (
          <ResourceChart
            label="GPU"
            icon={<GraphicsCardIcon size={13} />}
            meta={gpu.name}
            metaMono
            value={gpu.usage === null ? "â€”" : formatPercent(gpu.usage)}
            data={gpuPoints}
            series={gpuSeries}
            emptyMessage="Collecting samples"
            ariaLabel={`GPU utilization over the last ${samples.length} seconds`}
            yDomain={[0, 100]}
            yTickFormatter={formatPercent}
            renderTooltipFooter={(sampledAt) => {
              const sample = sampleByTime.get(sampledAt);
              return sample ? <TopProcessFooter sample={sample} metric="gpu" /> : null;
            }}
          />
        ) : null}

        <ResourceChart
          label="Memory"
          icon={<MemoryIcon size={13} />}
          meta={`${formatBytes(latest.memoryUsed)} of ${formatBytes(latest.memoryTotal)}`}
          value={formatPercent(memoryPercent)}
          data={memoryPoints}
          series={memorySeries}
          emptyMessage="Collecting samples"
          ariaLabel={`Memory usage over the last ${samples.length} seconds`}
          yDomain={[0, 100]}
          yTickFormatter={formatPercent}
          renderTooltipFooter={(sampledAt) => {
            const sample = sampleByTime.get(sampledAt);
            return sample ? <TopProcessFooter sample={sample} metric="memory" /> : null;
          }}
        />

        <ResourceChart
          className={gpu ? undefined : "md:col-span-2"}
          label="Network"
          icon={<PlugsConnectedIcon size={13} />}
          meta={latest.networkInterfaces.join(", ") || "All adapters"}
          value={formatRate(latest.download)}
          data={networkPoints}
          series={networkSeries}
          emptyMessage="Collecting samples"
          ariaLabel={`Network download and upload over the last ${samples.length} seconds`}
          yDomain={[0, "auto"]}
          yTickFormatter={(value) => formatBytes(value)}
          renderTooltipFooter={(sampledAt) => {
            const sample = sampleByTime.get(sampledAt);
            return sample ? <NetworkFooter sample={sample} /> : null;
          }}
        />
      </div>

      <StoragePanel disks={latest.disks} />
    </Screen>
  );
}
