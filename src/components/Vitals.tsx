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

type VitalTone = "default" | "warning" | "critical";

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

function statusItem(
  label: string,
  value: string | null,
  className: string,
  icon: ReactNode,
): VitalStatusItem {
  return { label, value: value ?? "—", className, icon };
}

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

function VitalCard({
  label,
  value,
  tone,
  icon,
  status,
  children,
}: {
  label: string;
  value: string;
  tone?: VitalTone;
  icon: ReactNode;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <Reading label={label} value={value} tone={tone} icon={icon} size="compact" status={status} />
      <div className="mt-auto">{children}</div>
    </div>
  );
}

function cpuTemperature(thermal: ThermalSample | null): number | null {
  return thermal?.cpu.package?.celsius ?? thermal?.cpu.hottestCore?.celsius ?? null;
}

function gpuTemperature(thermal: ThermalSample | null): number | null {
  const temps = thermal?.gpus.map((item) => item.celsius).filter((value) => value !== null) ?? [];
  return temps.length > 0 ? Math.max(...temps) : null;
}

function gpuTone(usage: number | null): VitalTone {
  if (usage === null) {
    return "default";
  }
  const level = loadTone(usage);
  if (level === "elevated") {
    return "warning";
  }
  return level === "high" || level === "peak" ? "critical" : "default";
}

function CpuVital({ latest, thermal }: { latest: ResourceSample; thermal: ThermalSample | null }) {
  const temperature = cpuTemperature(thermal);
  const load = loadStatus(latest.cpu);
  const heat = thermalStatus(temperature, "cpu");
  return (
    <VitalCard
      label="CPU"
      value={formatPercent(latest.cpu)}
      icon={<CpuIcon size={12} />}
      status={
        <VitalStatus
          items={[
            statusItem("Load", load, loadStatusClass(load), <GaugeIcon size={10} />),
            statusItem(
              "Temperature",
              heat,
              thermalStatusClass(heat),
              <ThermometerSimpleIcon size={10} />,
            ),
          ]}
        />
      }
    >
      <Meter label="CPU load" value={latest.cpu} tone={loadTone(latest.cpu)} />
      <VitalNote>
        <RollingValue value={temperature === null ? "—" : formatCelsius(temperature)} />
      </VitalNote>
    </VitalCard>
  );
}

function GpuVital({ latest, thermal }: { latest: ResourceSample; thermal: ThermalSample | null }) {
  const gpu = latest.gpus[0] ?? null;
  const usage = gpu?.usage ?? null;
  const temperature = gpuTemperature(thermal);
  const load = loadStatus(usage);
  const heat = thermalStatus(temperature, "gpu");
  return (
    <VitalCard
      label="GPU"
      value={usage === null ? "—" : formatPercent(usage)}
      tone={gpuTone(usage)}
      icon={<GraphicsCardIcon size={12} />}
      status={
        <VitalStatus
          items={[
            statusItem("Load", load, loadStatusClass(load), <GaugeIcon size={10} />),
            statusItem(
              "Temperature",
              heat,
              thermalStatusClass(heat),
              <ThermometerSimpleIcon size={10} />,
            ),
          ]}
        />
      }
    >
      <Meter label="GPU load" value={usage} tone={loadTone(usage ?? 0)} />
      <VitalNote>
        <RollingValue value={temperature === null ? "—" : formatCelsius(temperature)} />
      </VitalNote>
    </VitalCard>
  );
}

function MemoryVital({ latest }: { latest: ResourceSample }) {
  const percent = latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
  const load = loadStatus(percent);
  return (
    <VitalCard
      label="Memory"
      value={formatPercent(percent)}
      icon={<MemoryIcon size={12} />}
      status={
        <VitalStatus
          items={[statusItem("Load", load, loadStatusClass(load), <GaugeIcon size={10} />)]}
        />
      }
    >
      <Meter label="Memory load" value={percent} tone={loadTone(percent)} />
      <VitalNote>
        <RollingValue
          value={`${formatBytes(latest.memoryUsed)} of ${formatBytes(latest.memoryTotal)}`}
        />
      </VitalNote>
    </VitalCard>
  );
}

function NetworkVital({ latest }: { latest: ResourceSample }) {
  const activity = networkStatus(latest.download + latest.upload);
  return (
    <VitalCard
      label="Download"
      value={formatRate(latest.download)}
      icon={<PlugsConnectedIcon size={12} />}
      status={
        <VitalStatus
          items={[
            statusItem(
              "Activity",
              activity,
              loadStatusClass(activity),
              <ArrowsDownUpIcon size={10} />,
            ),
          ]}
        />
      }
    >
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
    </VitalCard>
  );
}

export function Vitals({
  latest,
  thermal,
}: {
  latest: ResourceSample;
  thermal: ThermalSample | null;
}) {
  return (
    <div className="grid grid-cols-4 divide-x divide-border-subtle border border-border [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:p-3 sm:[&>div]:p-4">
      <CpuVital latest={latest} thermal={thermal} />
      <GpuVital latest={latest} thermal={thermal} />
      <MemoryVital latest={latest} />
      <NetworkVital latest={latest} />
    </div>
  );
}
