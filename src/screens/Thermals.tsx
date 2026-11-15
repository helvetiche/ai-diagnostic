import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowClockwiseIcon,
  CopyIcon,
  CpuIcon,
  GraphicsCardIcon,
  ThermometerSimpleIcon,
} from "@phosphor-icons/react";

import { ResourceChart, type ChartPoint, type ChartSeries } from "@/components/ResourceChart";
import { useThermalStream, type ThermalStreamStatus } from "@/hooks/useThermalStream";
import { formatCelsius } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CpuThermal, GpuThermal, PawnIoStatus, SensorInfo } from "@/types/thermal";

const PAWNIO_URL = "https://pawnio.eu";

function StatusLine({ status }: { status: ThermalStreamStatus }) {
  const label =
    status === "live"
      ? "Sampling every 2 s"
      : status === "loading"
        ? "Starting thermal sampler"
        : "Thermal sampler unavailable";

  return (
    <p
      role="status"
      className="flex items-center gap-2 text-[11px] leading-4 font-medium text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0",
          status === "live" && "bg-primary",
          status === "loading" && "bg-muted-foreground",
          status === "error" && "bg-critical",
        )}
      />
      {label}
    </p>
  );
}

function PageHeader({ status }: { status: ThermalStreamStatus }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground">
          Thermals
        </h1>
        <p className="mt-1.5 max-w-lg text-xs leading-5 text-muted-foreground">
          CPU and GPU temperatures read from this machine every two seconds.
        </p>
      </div>
      <StatusLine status={status} />
    </header>
  );
}

function SensorBadge({ sensor }: { sensor: SensorInfo }) {
  const label =
    sensor.status === "live"
      ? "Live"
      : sensor.status === "fallback"
        ? "Fallback"
        : "Unavailable";

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] leading-4 font-medium">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0",
          sensor.status === "live" && "bg-primary",
          sensor.status === "fallback" && "bg-warning",
          sensor.status === "unavailable" && "bg-muted-foreground",
        )}
      />
      <span
        className={cn(
          sensor.status === "fallback" ? "text-warning" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function CpuCard({ cpu }: { cpu: CpuThermal }) {
  const packageReading = cpu.package;

  return (
    <section className="bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center bg-surface-muted text-primary">
            <CpuIcon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
              CPU
            </h2>
            <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">{cpu.name}</p>
          </div>
        </div>
        <SensorBadge sensor={cpu.sensor} />
      </div>

      <div className="mt-5">
        <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {packageReading?.label ?? "Package temperature"}
        </p>

        {packageReading ? (
          <p className="mt-1 font-mono text-2xl leading-8 font-medium tabular-nums text-foreground">
            {formatCelsius(packageReading.celsius)}
          </p>
        ) : (
          <p className="mt-1 text-base leading-8 font-medium text-muted-foreground">
            No reading
          </p>
        )}

        {cpu.hottestCore ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Hottest core{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatCelsius(cpu.hottestCore.celsius)}
            </span>{" "}
            ({cpu.hottestCore.label})
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
        Source <span className="font-mono text-foreground">{cpu.sensor.methodLabel}</span>
        {cpu.sensor.status === "fallback" ? " (fallback)" : ""}
      </p>
    </section>
  );
}

function GpuCard({ gpu }: { gpu: GpuThermal }) {
  return (
    <section className="bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center bg-surface-muted text-primary">
            <GraphicsCardIcon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
              GPU
            </h2>
            <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">{gpu.name}</p>
          </div>
        </div>
        <SensorBadge sensor={gpu.sensor} />
      </div>

      <p className="mt-5 text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {gpu.sensor.label}
      </p>

      {gpu.celsius !== null ? (
        <p className="mt-1 font-mono text-2xl leading-8 font-medium tabular-nums text-foreground">
          {formatCelsius(gpu.celsius)}
        </p>
      ) : (
        <p className="mt-1 text-base leading-8 font-medium text-muted-foreground">No reading</p>
      )}

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{gpu.sensor.detail}</p>

      <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
        Source <span className="font-mono text-foreground">{gpu.sensor.methodLabel}</span>
      </p>
    </section>
  );
}

function NoGpuCard() {
  return (
    <section className="bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center bg-surface-muted text-muted-foreground">
          <GraphicsCardIcon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            GPU
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Windows did not report a graphics adapter for this machine.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReadingGrid({ cpu }: { cpu: CpuThermal }) {
  if (cpu.cores.length === 0) {
    return null;
  }

  const isIntel = cpu.sensor.method === "intel-msr";

  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            {isIntel ? "Core temperatures" : "Additional sensors"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {isIntel
              ? "One digital sensor per physical core."
              : "Extra readings from the same CPU sensor."}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Source <span className="font-mono text-foreground">{cpu.sensor.methodLabel}</span>
          </p>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {isIntel
            ? `${cpu.cores.length} ${cpu.cores.length === 1 ? "core" : "cores"}`
            : `${cpu.cores.length} ${cpu.cores.length === 1 ? "reading" : "readings"}`}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cpu.cores.map((core, index) => (
          <div
            key={`${core.label}-${index}`}
            className="flex items-baseline justify-between gap-2 bg-surface-muted px-3 py-2"
          >
            <dt className="truncate text-[11px] leading-4 text-muted-foreground">{core.label}</dt>
            <dd className="shrink-0 font-mono text-xs leading-4 tabular-nums text-foreground">
              {formatCelsius(core.celsius)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SensorAccess({
  cpu,
  gpus,
  pawnio,
  rechecking,
  recheckError,
  onRecheck,
}: {
  cpu: CpuThermal;
  gpus: GpuThermal[];
  pawnio: PawnIoStatus;
  rechecking: boolean;
  recheckError: string | null;
  onRecheck: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 4_000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyInstallerLink() {
    try {
      await navigator.clipboard.writeText(PAWNIO_URL);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Sensor access
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            What reads each temperature, and what is missing when a sensor is unavailable.
          </p>
        </div>
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="flex min-h-10 items-center gap-2 bg-surface-muted px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent disabled:opacity-60"
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {rechecking ? "Checking sensors" : "Check again"}
        </button>
      </div>

      {recheckError ? (
        <p
          role="status"
          className="mt-3 bg-critical-soft px-3 py-2 text-[11px] leading-4 text-critical"
        >
          {recheckError}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
            CPU method
          </dt>
          <dd className="mt-1 font-mono text-xs leading-5 text-foreground">
            {cpu.sensor.methodLabel}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-muted-foreground">{cpu.sensor.detail}</dd>
        </div>

        <div>
          <dt className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
            PawnIO driver
          </dt>
          <dd className="mt-1 font-mono text-xs leading-5 text-foreground">
            {pawnio.installed
              ? pawnio.version
                ? `Version ${pawnio.version}`
                : "Installed"
              : "Not installed"}
          </dd>
          {pawnio.module ? (
            <dd className="mt-1 text-xs leading-5 text-muted-foreground">
              Module <span className="font-mono text-foreground">{pawnio.module}</span>
            </dd>
          ) : null}
          <dd className="mt-1 text-xs leading-5 text-muted-foreground">{pawnio.detail}</dd>
        </div>
      </dl>

      {gpus.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
            GPU methods
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {gpus.map((gpu, index) => (
              <li
                key={`${gpu.name}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-xs leading-5"
              >
                <span className="text-muted-foreground">{gpu.name}</span>
                <span className="font-mono text-[11px] text-foreground">
                  {gpu.sensor.methodLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!pawnio.installed ? (
        <div className="mt-4 bg-surface-muted p-4">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            PawnIO is a separate signed driver. When installed, it adds Intel package and core
            sensors, or AMD Tctl/Tdie. Windog does not install or bundle the driver.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="select-all bg-surface px-2 py-1 font-mono text-[11px] leading-4 text-foreground">
              {PAWNIO_URL}
            </code>
            <button
              type="button"
              onClick={copyInstallerLink}
              className="flex min-h-10 items-center gap-1.5 bg-surface px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent"
            >
              <CopyIcon size={16} aria-hidden="true" />
              Copy install link
            </button>
          </div>
          {copyState === "copied" ? (
            <p role="status" className="mt-2 text-[11px] leading-4 text-success">
              Install link copied.
            </p>
          ) : null}
          {copyState === "failed" ? (
            <p role="status" className="mt-2 text-[11px] leading-4 text-warning">
              Could not copy. Select the link and copy it manually.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function hottestGpuCelsius(gpus: GpuThermal[]): number | null {
  let hottest: number | null = null;

  for (const gpu of gpus) {
    if (gpu.celsius !== null && (hottest === null || gpu.celsius > hottest)) {
      hottest = gpu.celsius;
    }
  }

  return hottest;
}

export function Thermals() {
  const { samples, status, error, retry, reset } = useThermalStream();
  const latest = samples.at(-1) ?? null;
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!rechecking) {
      return;
    }

    const timer = window.setTimeout(() => setRechecking(false), 2_500);
    return () => window.clearTimeout(timer);
  }, [rechecking]);

  async function handleRecheck() {
    setRecheckError(null);
    setRechecking(true);

    try {
      await invoke("recheck_thermals");
      reset();
    } catch (cause) {
      setRechecking(false);
      setRecheckError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const points = useMemo<ChartPoint[]>(
    () =>
      samples.map((sample) => {
        const point: ChartPoint = { sampledAt: sample.sampledAt };

        if (sample.cpu.package) {
          point.cpu = sample.cpu.package.celsius;
        }

        const gpuCelsius = hottestGpuCelsius(sample.gpus);

        if (gpuCelsius !== null) {
          point.gpu = gpuCelsius;
        }

        return point;
      }),
    [samples],
  );

  const hasCpuSeries = samples.some((sample) => sample.cpu.package !== null);
  const hasGpuSeries = samples.some((sample) => hottestGpuCelsius(sample.gpus) !== null);

  const series = useMemo<ChartSeries[]>(() => {
    const next: ChartSeries[] = [];

    if (hasCpuSeries) {
      next.push({
        key: "cpu",
        label:
          latest?.cpu.sensor.method === "acpi-zone" ? "CPU (ACPI zone)" : "CPU package",
        color: "var(--chart-1)",
        formatValue: formatCelsius,
      });
    }

    if (hasGpuSeries) {
      next.push({
        key: "gpu",
        label: "GPU (hottest)",
        color: "var(--chart-upload)",
        formatValue: formatCelsius,
      });
    }

    return next;
  }, [hasCpuSeries, hasGpuSeries, latest?.cpu.sensor.method]);

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader status={status} />

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            The thermal sampler did not start
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            Temperatures come from the desktop app. Run it with{" "}
            <span className="font-mono">npm run tauri dev</span>, not{" "}
            <span className="font-mono">npm run dev</span>.
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
        <PageHeader status={status} />

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Starting the thermal sampler
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            The first reading arrives in about two seconds. Nothing is drawn until a real
            reading exists.
          </p>
        </section>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader status={status} />

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            {rechecking ? "Checking sensor access" : "No thermal sample yet"}
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            {rechecking
              ? "The sampler is re-detecting sensors. The first new reading arrives within two seconds."
              : "The sampler is running. The first reading arrives within two seconds."}
          </p>
        </section>
      </div>
    );
  }

  const hasAnyReading =
    latest.cpu.package !== null ||
    latest.cpu.cores.length > 0 ||
    latest.gpus.some((gpu) => gpu.celsius !== null);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
      <PageHeader status={status} />

      {!hasAnyReading ? (
        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            No temperature sensor reported a value
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            Every probe is listed below with its result. The screen stays on live data and does
            not fill the gap with an estimate.
          </p>
        </section>
      ) : null}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <CpuCard cpu={latest.cpu} />

        <div className="flex flex-col gap-4">
          {latest.gpus.length === 0 ? (
            <NoGpuCard />
          ) : (
            latest.gpus.map((gpu, index) => (
              <GpuCard key={`${gpu.name}-${index}`} gpu={gpu} />
            ))
          )}
        </div>
      </div>

      {series.length > 0 ? (
        <ResourceChart
          title="Temperature, last 10 minutes"
          icon={<ThermometerSimpleIcon size={16} aria-hidden="true" />}
          data={points}
          series={series}
          emptyMessage="Waiting for two thermal samples before drawing the line."
          ariaLabel="CPU and GPU temperature over the last ten minutes"
          yDomain={[0, 120]}
          yTickFormatter={(value) => formatCelsius(value)}
          chartClassName="h-40"
        />
      ) : null}

      <ReadingGrid cpu={latest.cpu} />

      <SensorAccess
        cpu={latest.cpu}
        gpus={latest.gpus}
        pawnio={latest.pawnio}
        rechecking={rechecking}
        recheckError={recheckError}
        onRecheck={() => {
          void handleRecheck();
        }}
      />
    </div>
  );
}
