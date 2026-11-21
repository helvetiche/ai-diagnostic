import type { ReactNode } from "react";
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

import { Meter } from "@/components/primitives/Meter";
import { Reading } from "@/components/primitives/Reading";
import { RollingValue } from "@/components/primitives/RollingValue";
import { formatBytes, formatCelsius, formatPercent, formatRate } from "@/lib/format";
import { loadTone, loadStatus, loadStatusClass, networkStatus } from "@/lib/loadLevel";
import { thermalStatus, thermalStatusClass } from "@/lib/thermalLevel";
import { cn } from "@/lib/utils";
import type { ResourceSample } from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

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

export function Vitals({
  latest,
  thermal,
}: {
  latest: ResourceSample;
  thermal: ThermalSample | null;
}) {
  const memoryPercent = latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
  const gpu = latest.gpus[0] ?? null;
  const gpuLoad = gpu?.usage === null ? null : loadTone(gpu.usage);
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
          <Meter label="CPU load" value={latest.cpu} tone={loadTone(latest.cpu)} />
          <VitalNote>
            <RollingValue value={cpuTemp === null ? "—" : formatCelsius(cpuTemp)} />
          </VitalNote>
        </div>
      </div>

      <div>
        <Reading
          label="GPU"
          value={gpu?.usage === null ? "—" : formatPercent(gpu.usage)}
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
          <Meter label="GPU load" value={gpu?.usage ?? null} tone={loadTone(gpu?.usage ?? 0)} />
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
          <Meter label="Memory load" value={memoryPercent} tone={loadTone(memoryPercent)} />
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
