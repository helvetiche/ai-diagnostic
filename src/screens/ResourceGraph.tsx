import { useMemo } from "react";
import {
  ArrowsDownUpIcon,
  CaretRightIcon,
  CpuIcon,
  DownloadSimpleIcon,
  GraphicsCardIcon,
  MemoryIcon,
  ThermometerSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { ResourceChart, type ChartPoint, type ChartSeries } from "@/components/ResourceChart";
import { type ResourceStreamStatus, useResourceStream } from "@/hooks/useResourceStream";
import { type ThermalStreamStatus, useThermalStream } from "@/hooks/useThermalStream";
import { formatBytes, formatCelsius, formatPercent, formatRate, formatUptime } from "@/lib/format";
import { processLevel } from "@/lib/processLevel";
import { cn } from "@/lib/utils";
import type {
  DiskSample,
  GpuSample,
  ResourceSample,
  TopNetworkProcess,
  TopProcess,
} from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

function StatusLine({ status }: { status: ResourceStreamStatus }) {
  const label =
    status === "live"
      ? "Sampling every 1 s"
      : status === "paused"
        ? "Paused while hidden"
        : status === "loading"
          ? "Starting sampler"
          : "Sampler unavailable";

  return (
    <p className="flex items-center gap-2 text-[11px] leading-4 font-medium text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0",
          status === "live" && "bg-primary",
          status === "paused" && "bg-muted-foreground",
          status === "loading" && "bg-muted-foreground",
          status === "error" && "bg-critical",
        )}
      />
      {label}
    </p>
  );
}

function PageHeader({ uptime, status }: { uptime: number | null; status: ResourceStreamStatus }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground">
          Resource Graph
        </h1>
        <p className="mt-1.5 max-w-lg text-xs leading-5 text-muted-foreground">
          Live counters read from this machine, once per second.
          {uptime === null ? "" : ` System up ${formatUptime(uptime)}.`}
        </p>
      </div>
      <StatusLine status={status} />
    </header>
  );
}

function TooltipProcessRow({
  name,
  percent,
  value,
}: {
  name: string;
  percent: number;
  value: string;
}) {
  const level = processLevel(percent);

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2 shrink-0"
          style={{ backgroundColor: level.color }}
        />
        <span className="max-w-32 truncate">{name}</span>
      </span>
      <span
        className="shrink-0 px-1.5 py-0.5 font-mono text-[10px] leading-4 tabular-nums"
        style={{ backgroundColor: `${level.color}20`, color: level.color }}
      >
        {value}
      </span>
    </div>
  );
}

function TopProcessTooltipSection({
  title,
  icon: SectionIcon,
  processes,
  metric,
  memoryTotal,
}: {
  title: string;
  icon: typeof CpuIcon;
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
      <p className="flex items-center gap-1.5 text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <SectionIcon size={12} aria-hidden="true" />
        {title}
      </p>
      {processes.length === 0 ? (
        <p className="text-muted-foreground">No activity</p>
      ) : (
        processes.map((process) => {
          const percent = processPercent(process);

          return (
            <TooltipProcessRow
              key={process.name}
              name={process.name}
              percent={percent}
              value={metric === "memory" ? formatBytes(process.memory) : formatPercent(percent)}
            />
          );
        })
      )}
    </div>
  );
}

function TopProcessTooltipFooter({
  sample,
  title,
  icon,
  metric,
}: {
  sample: ResourceSample;
  title: string;
  icon: typeof CpuIcon;
  metric: "cpu" | "memory" | "gpu";
}) {
  const processes =
    metric === "cpu" ? sample.topCpu : metric === "memory" ? sample.topMemory : sample.topGpu;

  return (
    <TopProcessTooltipSection
      title={title}
      icon={icon}
      processes={processes ?? []}
      metric={metric}
      memoryTotal={sample.memoryTotal}
    />
  );
}

function TopNetworkTooltipSection({
  title,
  icon: SectionIcon,
  processes,
  total,
}: {
  title: string;
  icon: typeof CpuIcon;
  processes: TopNetworkProcess[];
  total: number;
}) {
  return (
    <div className="grid gap-1">
      <p className="flex items-center gap-1.5 text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <SectionIcon size={12} aria-hidden="true" />
        {title}
      </p>
      {processes.length === 0 ? (
        <p className="text-muted-foreground">No activity</p>
      ) : (
        processes.map((process) => {
          const percent = total > 0 ? Math.min((process.rate / total) * 100, 100) : 0;

          return (
            <TooltipProcessRow
              key={process.name}
              name={process.name}
              percent={percent}
              value={formatRate(process.rate)}
            />
          );
        })
      )}
    </div>
  );
}

function NetworkTooltipFooter({ sample }: { sample: ResourceSample }) {
  if (!sample.networkAttribution) {
    return (
      <div className="grid gap-1">
        <p className="flex items-center gap-1.5 text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <ArrowsDownUpIcon size={12} aria-hidden="true" />
          Per-app network
        </p>
        <p className="text-muted-foreground">Per-app network needs administrator access.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <TopNetworkTooltipSection
        title="Top download"
        icon={DownloadSimpleIcon}
        processes={sample.topDownload ?? []}
        total={sample.download}
      />
      <TopNetworkTooltipSection
        title="Top upload"
        icon={UploadSimpleIcon}
        processes={sample.topUpload ?? []}
        total={sample.upload}
      />
    </div>
  );
}

function VolumeRow({ name, mount, total, available, removable, kind }: {
  name: string;
  mount: string;
  total: number;
  available: number;
  removable: boolean;
  kind: string;
}) {
  const used = total > 0 ? ((total - available) / total) * 100 : 0;
  const status =
    used >= 90 ? "critical" : used >= 80 ? "warning" : "healthy";
  const statusLabel =
    status === "critical"
      ? "Almost full"
      : status === "warning"
        ? "Low space"
        : "Healthy";
  const statusColor =
    status === "critical"
      ? "bg-critical text-critical"
      : status === "warning"
        ? "bg-warning text-warning"
        : "bg-success text-success";
  const barColor =
    status === "critical"
      ? "bg-critical"
      : status === "warning"
        ? "bg-warning"
        : "bg-success";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground">{name}</span>
          {removable ? (
            <span className="text-[11px] leading-4 text-muted-foreground">Removable</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 shrink-0 ${statusColor.split(" ")[0]}`} />
            <span className={`text-[11px] leading-4 font-medium ${statusColor.split(" ")[1]}`}>
              {statusLabel}
            </span>
          </span>
          <span className="font-mono text-[11px] leading-4 text-muted-foreground">
            {kind}
          </span>
          <span className="font-mono text-[11px] leading-4 text-muted-foreground">
            {mount}
          </span>
        </span>
      </div>

      <div aria-hidden="true" className="mt-2 h-1.5 w-full bg-surface-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(used, 100)}%` }} />
      </div>

      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        {formatBytes(available)} free of {formatBytes(total)} ({formatPercent(used)} used)
      </p>
    </li>
  );
}

function VolumeList({ disks }: { disks: DiskSample[] }) {
  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Volumes
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Space per mounted volume. Refreshed every five seconds.
          </p>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {disks.length === 1 ? "1 volume" : `${disks.length} volumes`}
        </p>
      </div>

      {disks.length === 0 ? (
        <p className="mt-4 bg-surface-muted px-4 py-6 text-center text-xs text-muted-foreground">
          No mounted volume reported by Windows.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {disks.map((disk) => (
            <VolumeRow
              key={`${disk.mount}-${disk.name}`}
              name={disk.name}
              mount={disk.mount}
              total={disk.total}
              available={disk.available}
              removable={disk.removable}
              kind={disk.kind}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GpuList({ gpus }: { gpus: GpuSample[] }) {
  if (gpus.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Graphics adapters
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Adapter memory and utilization. Usage may be unavailable on some systems.
          </p>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {gpus.length === 1 ? "1 adapter" : `${gpus.length} adapters`}
        </p>
      </div>

      <ul className="mt-4 divide-y divide-border-subtle">
        {gpus.map((gpu, index) => (
          <li key={`${gpu.name}-${index}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-xs font-medium text-foreground">{gpu.name}</span>
              <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground">
                {gpu.usage === null ? "usage n/a" : formatPercent(gpu.usage)}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
              {formatBytes(gpu.memoryTotal)} dedicated memory
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ThermalSummary({
  sample,
  status,
  onOpen,
}: {
  sample: ThermalSample | null;
  status: ThermalStreamStatus;
  onOpen?: () => void;
}) {
  const cpu = sample?.cpu.package?.celsius ?? null;
  const hottestCore = sample?.cpu.hottestCore?.celsius ?? null;
  const gpuReadings = sample?.gpus.filter((gpu) => gpu.celsius !== null) ?? [];
  const hottestGpu = gpuReadings.reduce<number | null>((hottest, gpu) => {
    if (gpu.celsius === null) {
      return hottest;
    }

    return hottest === null || gpu.celsius > hottest ? gpu.celsius : hottest;
  }, null);

  const loading = status === "loading" && sample === null;
  const failed = status === "error";

  const cpuText = failed
    ? "Thermal sampler unavailable."
    : loading
      ? "Starting the thermal sampler."
      : cpu !== null
        ? `CPU ${formatCelsius(cpu)}${
            hottestCore !== null ? `, hottest core ${formatCelsius(hottestCore)}` : ""
          }.`
        : "CPU temperature unavailable.";

  const gpuText =
    failed || loading
      ? ""
      : gpuReadings.length === 0 || hottestGpu === null
        ? " GPU temperature unavailable."
        : sample && sample.gpus.length > 1
          ? ` ${gpuReadings.length} of ${sample.gpus.length} GPUs reporting, hottest ${formatCelsius(
              hottestGpu,
            )}.`
          : ` GPU ${formatCelsius(hottestGpu)}.`;

  const methods = sample
    ? [sample.cpu.sensor.methodLabel, ...sample.gpus.map((gpu) => gpu.sensor.methodLabel)].filter(
        (method, index, all) => all.indexOf(method) === index,
      )
    : [];

  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center bg-surface-muted text-primary">
            <ThermometerSimpleIcon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
              Thermals
            </h2>
            <p className="mt-1 text-xs leading-5 text-foreground">
              {cpuText}
              {gpuText}
            </p>
            {methods.length > 0 ? (
              <p className="mt-1 font-mono text-[11px] leading-4 text-muted-foreground">
                {methods.join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-10 items-center gap-1.5 bg-surface-muted px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent"
          >
            Open Thermals
            <CaretRightIcon size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ResourceGraph({ onOpenThermals }: { onOpenThermals?: () => void }) {
  const { samples, status, error, retry } = useResourceStream();
  const { samples: thermalSamples, status: thermalStatus } = useThermalStream();
  const latest = samples.at(-1) ?? null;
  const thermalLatest = thermalSamples.at(-1) ?? null;

  const sampleByTime = useMemo(
    () => new Map(samples.map((sample) => [sample.sampledAt, sample])),
    [samples],
  );

  const cpuPoints = useMemo<ChartPoint[]>(
    () =>
      samples.map((sample) => ({
        sampledAt: sample.sampledAt,
        cpu: sample.cpu,
      })),
    [samples],
  );

  const memoryPoints = useMemo<ChartPoint[]>(
    () =>
      samples.map((sample) => ({
        sampledAt: sample.sampledAt,
        memory: sample.memoryTotal > 0 ? (sample.memoryUsed / sample.memoryTotal) * 100 : 0,
      })),
    [samples],
  );

  const networkPoints = useMemo<ChartPoint[]>(
    () =>
      samples.map((sample) => ({
        sampledAt: sample.sampledAt,
        download: sample.download,
        upload: sample.upload,
      })),
    [samples],
  );

  const gpuPoints = useMemo<ChartPoint[]>(
    () =>
      samples.map((sample) => ({
        sampledAt: sample.sampledAt,
        usage: sample.gpus[0]?.usage ?? 0,
      })),
    [samples],
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

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader uptime={null} status="error" />

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            The resource sampler did not start
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            These counters come from the desktop app. Run it with{" "}
            <span className="font-mono">npm run tauri dev</span>, not{" "}
            <span className="font-mono">npm run dev</span>. The sampler also fails if the
            window loses its local connection.
          </p>
          <p className="mt-3 bg-surface-muted px-3 py-2 font-mono text-[11px] leading-4 break-words text-muted-foreground">
            {error ?? "Unknown error"}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 min-h-10 bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-[120ms] ease-soft hover:bg-primary/90"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (status === "loading" && samples.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader uptime={null} status={status} />

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Starting the local sampler
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            The first reading arrives in about a second. Nothing is drawn until a real sample
            exists.
          </p>
        </section>
      </div>
    );
  }

  const memoryPercent =
    latest && latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
      <PageHeader uptime={latest?.uptime ?? null} status={status} />

      <ThermalSummary
        sample={thermalLatest}
        status={thermalStatus}
        onOpen={onOpenThermals}
      />

      <ResourceChart
        title={latest?.cpuBrand || "CPU"}
        icon={<CpuIcon size={16} aria-hidden="true" />}
        data={cpuPoints}
        series={cpuSeries}
        emptyMessage="Waiting for two samples before drawing the line."
        ariaLabel={`CPU usage over the last ${samples.length} seconds`}
        yDomain={[0, 100]}
        yTickFormatter={formatPercent}
        meter={{ value: latest?.cpu ?? 0 }}
        renderTooltipFooter={(sampledAt) => {
          const sample = sampleByTime.get(sampledAt);

          return sample ? (
            <TopProcessTooltipFooter
              sample={sample}
              title="Top CPU"
              icon={CpuIcon}
              metric="cpu"
            />
          ) : null;
        }}
      />

      {latest?.gpus.length ? (
        <ResourceChart
          title={latest.gpus[0].name}
          icon={<GraphicsCardIcon size={16} aria-hidden="true" />}
          data={gpuPoints}
          series={gpuSeries}
          emptyMessage="Waiting for two samples before drawing the line."
          ariaLabel={`GPU utilization over the last ${samples.length} seconds`}
          yDomain={[0, 100]}
          yTickFormatter={formatPercent}
          meter={
            latest.gpus[0].usage === null
              ? undefined
              : { value: latest.gpus[0].usage }
          }
          renderTooltipFooter={(sampledAt) => {
            const sample = sampleByTime.get(sampledAt);

            return sample ? (
              <TopProcessTooltipFooter
                sample={sample}
                title="Top GPU"
                icon={GraphicsCardIcon}
                metric="gpu"
              />
            ) : null;
          }}
        />
      ) : null}

      <ResourceChart
        title="Memory"
        icon={<MemoryIcon size={16} aria-hidden="true" />}
        data={memoryPoints}
        series={memorySeries}
        emptyMessage="Waiting for two samples before drawing the line."
        ariaLabel={`Memory usage over the last ${samples.length} seconds`}
        yDomain={[0, 100]}
        yTickFormatter={formatPercent}
        meter={{ value: memoryPercent }}
        renderTooltipFooter={(sampledAt) => {
          const sample = sampleByTime.get(sampledAt);

          return sample ? (
            <TopProcessTooltipFooter
              sample={sample}
              title="Top memory"
              icon={MemoryIcon}
              metric="memory"
            />
          ) : null;
        }}
      />

      <ResourceChart
        title={latest?.networkInterfaces.join(", ") || "Network throughput"}
        icon={<ArrowsDownUpIcon size={16} aria-hidden="true" />}
        data={networkPoints}
        series={networkSeries}
        emptyMessage="Waiting for two samples before drawing the line."
        ariaLabel={`Network download and upload over the last ${samples.length} seconds`}
        yDomain={[0, "auto"]}
        yTickFormatter={(value) => formatBytes(value)}
        renderTooltipFooter={(sampledAt) => {
          const sample = sampleByTime.get(sampledAt);

          return sample ? <NetworkTooltipFooter sample={sample} /> : null;
        }}
      />

      <VolumeList disks={latest?.disks ?? []} />

      <GpuList gpus={latest?.gpus ?? []} />
    </div>
  );
}
