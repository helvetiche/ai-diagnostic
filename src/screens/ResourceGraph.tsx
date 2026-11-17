import { useMemo, type ReactNode } from "react";
import {
  ArrowUpIcon,
  ArrowsDownUpIcon,
  CpuIcon,
  GaugeIcon,
  GraphicsCardIcon,
  MemoryIcon,
  PlugsConnectedIcon,
  ThermometerSimpleIcon,
} from "@phosphor-icons/react";

import { Screen } from "@/components/layout/Screen";
import { Meter, type MeterTone } from "@/components/primitives/Meter";
import { Reading } from "@/components/primitives/Reading";
import { RollingValue } from "@/components/primitives/RollingValue";
import { StateView } from "@/components/primitives/StateView";
import { ResourceChart, type ChartPoint, type ChartSeries } from "@/components/ResourceChart";
import { Button } from "@/components/primitives/Button";
import { useResourceStream } from "@/hooks/useResourceStream";
import { useThermalStream } from "@/hooks/useThermalStream";
import { formatBytes, formatCelsius, formatPercent, formatRate } from "@/lib/format";
import { loadTone, loadStatus, loadStatusClass, networkStatus } from "@/lib/loadLevel";
import { thermalStatus, thermalStatusClass } from "@/lib/thermalLevel";
import { cn } from "@/lib/utils";
import type { DiskSample, ResourceSample, TopNetworkProcess, TopProcess } from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

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
            value={metric === "memory" ? formatBytes(process.memory) : formatPercent(processPercent(process))}
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

function NetworkSection({
  title,
  processes,
}: {
  title: string;
  processes: TopNetworkProcess[];
}) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
      {processes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No activity</p>
      ) : (
        processes.map((process) => (
          <TooltipProcessRow key={process.name} name={process.name} value={formatRate(process.rate)} />
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

function VitalNote({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-1 min-h-4 truncate font-mono text-[11px] leading-4 tabular-nums text-muted-foreground">
      {children ?? "\u00A0"}
    </p>
  );
}

type VitalStatusItem = {
  label: string;
  value: string;
  className: string;
  icon: ReactNode;
};

function VitalStatus({ items }: { items: VitalStatusItem[] }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {items.map((item) => (
        <span
          key={item.label}
          title={item.label}
          className={cn(
            "inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 whitespace-nowrap capitalize",
            item.className,
          )}
        >
          <span aria-hidden="true" className="shrink-0">
            {item.icon}
          </span>
          <span className="sr-only">{item.label}: </span>
          {item.value}
        </span>
      ))}
    </span>
  );
}

function Vitals({
  latest,
  thermal,
}: {
  latest: ResourceSample;
  thermal: ThermalSample | null;
}) {
  const memoryPercent =
    latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
  const gpu = latest.gpus[0] ?? null;
  const gpuLoad = gpu?.usage == null ? null : loadTone(gpu.usage);
  const gpuTone =
    gpuLoad === "elevated"
      ? "warning"
      : gpuLoad === "high" || gpuLoad === "peak"
        ? "critical"
        : "default";
  const cpuTemp = thermal?.cpu.package?.celsius ?? thermal?.cpu.hottestCore?.celsius ?? null;
  const gpuTemps =
    thermal?.gpus.map((item) => item.celsius).filter((value) => value !== null) ?? [];
  const gpuTemp = gpuTemps.length > 0 ? Math.max(...gpuTemps) : null;

  const cpuStatus = loadStatus(latest.cpu);
  const cpuThermal = thermalStatus(cpuTemp, "cpu");
  const gpuStatus = loadStatus(gpu?.usage ?? null);
  const gpuThermal = thermalStatus(gpuTemp, "gpu");
  const memoryStatus = loadStatus(memoryPercent);
  const downloadStatus = networkStatus(latest.download + latest.upload);

  return (
    <div className="grid grid-cols-4 divide-x divide-border-subtle border border-border [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:p-3 sm:[&>div]:p-4">
      <div>
        <Reading
          label="CPU"
          value={formatPercent(latest.cpu)}
          icon={<CpuIcon size={12} />}
          size="compact"
          status={
            <VitalStatus
              items={[
                {
                  label: "Load",
                  value: cpuStatus ?? "—",
                  className: loadStatusClass(cpuStatus),
                  icon: <GaugeIcon size={10} />,
                },
                {
                  label: "Temperature",
                  value: cpuThermal ?? "—",
                  className: thermalStatusClass(cpuThermal),
                  icon: <ThermometerSimpleIcon size={10} />,
                },
              ]}
            />
          }
        />
        <div className="mt-auto">
          <Meter
            label="CPU load"
            value={latest.cpu}
            tone={loadTone(latest.cpu)}
          />
          <VitalNote>
            <RollingValue value={cpuTemp === null ? "—" : formatCelsius(cpuTemp)} />
          </VitalNote>
        </div>
      </div>

      <div>
        <Reading
          label="GPU"
          value={gpu?.usage == null ? "—" : formatPercent(gpu.usage)}
          tone={gpuTone}
          icon={<GraphicsCardIcon size={12} />}
          size="compact"
          status={
            <VitalStatus
              items={[
                {
                  label: "Load",
                  value: gpuStatus ?? "—",
                  className: loadStatusClass(gpuStatus),
                  icon: <GaugeIcon size={10} />,
                },
                {
                  label: "Temperature",
                  value: gpuThermal ?? "—",
                  className: thermalStatusClass(gpuThermal),
                  icon: <ThermometerSimpleIcon size={10} />,
                },
              ]}
            />
          }
        />
        <div className="mt-auto">
          <Meter
            label="GPU load"
            value={gpu?.usage ?? null}
            tone={loadTone(gpu?.usage ?? 0)}
          />
          <VitalNote>
            <RollingValue value={gpuTemp === null ? "—" : formatCelsius(gpuTemp)} />
          </VitalNote>
        </div>
      </div>

      <div>
        <Reading
          label="Memory"
          value={formatPercent(memoryPercent)}
          icon={<MemoryIcon size={12} />}
          size="compact"
          status={
            <VitalStatus
              items={[
                {
                  label: "Load",
                  value: memoryStatus ?? "—",
                  className: loadStatusClass(memoryStatus),
                  icon: <GaugeIcon size={10} />,
                },
              ]}
            />
          }
        />
        <div className="mt-auto">
          <Meter
            label="Memory load"
            value={memoryPercent}
            tone={loadTone(memoryPercent)}
          />
          <VitalNote>
            <RollingValue
              value={`${formatBytes(latest.memoryUsed)} of ${formatBytes(latest.memoryTotal)}`}
            />
          </VitalNote>
        </div>
      </div>

      <div>
        <Reading
          label="Download"
          value={formatRate(latest.download)}
          icon={<PlugsConnectedIcon size={12} />}
          size="compact"
          status={
            <VitalStatus
              items={[
                {
                  label: "Activity",
                  value: downloadStatus,
                  className: loadStatusClass(downloadStatus),
                  icon: <ArrowsDownUpIcon size={10} />,
                },
              ]}
            />
          }
        />
        <div className="mt-auto">
          <p className="truncate font-mono text-[10px] leading-4 text-muted-foreground">
            {latest.networkInterfaces.join(", ") || "No adapter"}
          </p>
          <VitalNote>
            <span className="inline-flex items-center gap-1">
              <ArrowUpIcon size={11} aria-hidden="true" />
              <span className="font-mono tabular-nums">
                <RollingValue value={formatRate(latest.upload)} />
              </span>
            </span>
          </VitalNote>
        </div>
      </div>
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
          {disk.mount} · {disk.kind}
        </span>
      </div>

      <Meter className="mt-2" label={`${disk.name} space used`} value={used} tone={tone} />

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">
          {formatBytes(disk.available)} free of {formatBytes(disk.total)}
        </span>
        <span className={tone === "critical" ? "text-critical" : "text-muted-foreground"}>
          {formatPercent(used)} used{note ? ` · ${note}` : ""}
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

export function ResourceGraph() {
  const { samples, status, error, retry } = useResourceStream();
  const { samples: thermalSamples } = useThermalStream();
  const { snapshot: powerSnapshot } = usePowerHistory();
  const latest = samples.at(-1) ?? null;
  const thermalLatest = thermalSamples.at(-1) ?? null;

  const sampleByTime = useMemo(
    () => new Map(samples.map((sample) => [sample.sampledAt, sample])),
    [samples],
  );

  const powerLastStop = useMemo(() => {
    if (!powerSnapshot) {
      return null;
    }

    const stops = [
      ...powerSnapshot.shutdowns,
      ...powerSnapshot.restarts,
      ...powerSnapshot.powerOffs,
      ...powerSnapshot.unclassifiedStops,
    ].filter((record) => record.isStop && record.time !== null);

    stops.sort((left, right) => (right.time ?? 0) - (left.time ?? 0));
    return stops[0] ?? null;
  }, [powerSnapshot]);

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
    return (
      <Screen>
        <StateView title="Starting sampler" />
      </Screen>
    );
  }

  if (!latest) {
    return (
      <Screen>
        <StateView title="No sample yet" />
      </Screen>
    );
  }

  const memoryPercent =
    latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
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
            value={gpu.usage === null ? "—" : formatPercent(gpu.usage)}
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
