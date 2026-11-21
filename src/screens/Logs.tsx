import {
  CpuIcon,
  DesktopIcon,
  DeviceMobileIcon,
  HardDrivesIcon,
  PackageIcon,
  ShieldCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState, type ComponentType } from "react";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { StatusMark } from "@/components/primitives/StatusMark";
import { useLogs } from "@/hooks/useLogs";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LogsSnapshot } from "@/types/logs";

const EVENT_CATEGORIES = [
  "All",
  "Crash",
  "Hardware",
  "Storage",
  "Power",
  "Services",
  "Security",
  "Software",
  "Updates",
  "Drivers",
  "System",
] as const;

type EventCategory = (typeof EVENT_CATEGORIES)[number];

function parseIso(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yesNo(value: boolean | null): string {
  if (value === null) {
    return "—";
  }
  return value ? "Yes" : "No";
}

function numberOrDash(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return String(value);
}

function StorageHealthBadge({ disk }: { disk: LogsSnapshot["storage"][number] }) {
  if (disk.smartPredictFailure === true) {
    return <StatusMark tone="critical">SMART warning</StatusMark>;
  }
  if (disk.healthStatus !== null && disk.healthStatus !== 0) {
    // 0 = Healthy in MSFT_PhysicalDisk.HealthStatus
    return <StatusMark tone="warning">Degraded</StatusMark>;
  }
  if (disk.healthStatus === 0) {
    return <StatusMark tone="success">Healthy</StatusMark>;
  }
  return <StatusMark tone="info">Unknown</StatusMark>;
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}) {
  const Icon = icon;
  return (
    <div className="flex min-w-0 flex-col gap-1 border border-border-subtle bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon size={12} aria-hidden={true} />
        {label}
      </div>
      <span className="font-mono text-[16px] leading-none tabular-nums text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="text-[10px] leading-4 text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

function LogsSkeleton() {
  return (
    <Screen>
      <div aria-busy="true" className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="border border-border-subtle p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-16" />
            </div>
          ))}
        </div>
        <div className="border border-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading system logs</span>
    </Screen>
  );
}

export function Logs() {
  const { snapshot, status, error, refresh } = useLogs();
  const [category, setCategory] = useState<EventCategory>("All");
  const [softwareOpen, setSoftwareOpen] = useState(false);

  const filteredEvents = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    if (category === "All") {
      return snapshot.events;
    }
    return snapshot.events.filter((event) => event.category === category);
  }, [snapshot, category]);

  if (status === "loading" && !snapshot) {
    return <LogsSkeleton />;
  }

  if (status === "error" && !snapshot) {
    return (
      <Screen>
        <StateView
          title="System logs unavailable"
          code={error ?? "Unknown error"}
          action={
            <Button variant="primary" onClick={refresh}>
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }

  if (!snapshot) {
    return null;
  }

  const os = snapshot.os;
  const machine = snapshot.machine;
  const security = snapshot.security;
  const battery = snapshot.battery;

  const batteryHealth =
    battery && battery.designCapacity && battery.fullChargeCapacity
      ? Math.round((battery.fullChargeCapacity / battery.designCapacity) * 100)
      : null;

  const deviceProblemCount = snapshot.deviceProblems.length;
  const storageProblemCount = snapshot.storage.filter(
    (disk) => disk.smartPredictFailure === true || (disk.healthStatus !== null && disk.healthStatus !== 0),
  ).length;

  return (
    <Screen>
      {status === "error" ? (
        <Panel className="bg-critical-soft p-4">
          <h2 className="text-[13px] font-medium text-critical">The refresh failed</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-4 text-critical">
            {error ?? "The last successful read is still shown."}
          </p>
          <Button variant="quiet" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </Panel>
      ) : null}

      {snapshot.logError ? (
        <Panel className="bg-warning-soft p-4">
          <h2 className="text-[13px] font-medium text-warning">Partial result</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-4 text-warning">
            {snapshot.logError}
          </p>
        </Panel>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Operating system"
          value={os?.caption ?? "—"}
          hint={os?.version ? `Build ${os.build ?? "?"} · ${os.version}` : undefined}
          icon={DesktopIcon}
        />
        <SummaryCard
          label="Machine"
          value={machine?.model ?? machine?.manufacturer ?? "—"}
          hint={machine?.serialNumber ? `S/N ${machine.serialNumber}` : undefined}
          icon={CpuIcon}
        />
        <SummaryCard
          label="Memory"
          value={
            os?.totalVisibleMemoryKb
              ? formatBytes(os.totalVisibleMemoryKb * 1024)
              : "—"
          }
          hint={
            os?.freePhysicalMemoryKb
              ? `${formatBytes(os.freePhysicalMemoryKb * 1024)} free`
              : undefined
          }
          icon={DeviceMobileIcon}
        />
        <SummaryCard
          label="Storage"
          value={`${snapshot.storage.length} drive${snapshot.storage.length === 1 ? "" : "s"}`}
          hint={
            storageProblemCount > 0
              ? `${storageProblemCount} reporting issues`
              : "All healthy"
          }
          icon={HardDrivesIcon}
        />
        <SummaryCard
          label="Battery"
          value={battery ? `${battery.chargePercent ?? "—"}%` : "None"}
          hint={
            batteryHealth !== null
              ? `Health ${batteryHealth}% of design`
              : battery
                ? "Health unknown"
                : "No battery detected"
          }
          icon={DeviceMobileIcon}
        />
        <SummaryCard
          label="Device problems"
          value={String(deviceProblemCount)}
          hint={deviceProblemCount === 0 ? "No problem devices" : "Check Device Manager"}
          icon={WarningIcon}
        />
        <SummaryCard
          label="Security"
          value={security?.defenderRealtime ? "Protected" : security?.defenderRealtime === false ? "At risk" : "Unknown"}
          hint={
            security
              ? `Firewall ${security.firewallProfiles.filter((p) => p.enabled).length}/${security.firewallProfiles.length} · BitLocker ${security.bitlocker.filter((v) => v.protectionStatus === 1).length}/${security.bitlocker.length}`
              : undefined
          }
          icon={ShieldCheckIcon}
        />
        <SummaryCard
          label="Software"
          value={String(snapshot.softwareCount)}
          hint={`${snapshot.drivers.length} drivers · ${snapshot.reliability.length} reliability records`}
          icon={PackageIcon}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-medium text-foreground">Security posture</h2>
        <div className="grid grid-cols-1 gap-3 border border-border sm:grid-cols-2">
          <div className="flex flex-col gap-2 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Defender real-time protection</span>
              <span className={cn("font-mono text-[11px]", security?.defenderRealtime ? "text-success" : "text-critical")}>
                {yesNo(security?.defenderRealtime ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Antivirus enabled</span>
              <span className="font-mono text-[11px] text-foreground">{yesNo(security?.defenderAntivirus ?? null)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Antispyware enabled</span>
              <span className="font-mono text-[11px] text-foreground">{yesNo(security?.defenderAntispyware ?? null)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Signature last updated</span>
              <span className="font-mono text-[11px] text-foreground">
                {security?.defenderSignatureLastUpdated
                  ? formatDateTime(parseIso(security.defenderSignatureLastUpdated))
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Quick scan age (days)</span>
              <span className="font-mono text-[11px] text-foreground">{numberOrDash(security?.defenderQuickScanAge ?? null)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Full scan age (days)</span>
              <span className="font-mono text-[11px] text-foreground">{numberOrDash(security?.defenderFullScanAge ?? null)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Secure Boot</span>
              <span className="font-mono text-[11px] text-foreground">{yesNo(security?.secureBoot ?? null)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">TPM present / ready</span>
              <span className="font-mono text-[11px] text-foreground">
                {yesNo(security?.tpmPresent ?? null)} / {yesNo(security?.tpmReady ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">UAC enabled</span>
              <span className="font-mono text-[11px] text-foreground">{yesNo(security?.uacEnabled ?? null)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Pending reboot</span>
              <span className={cn("font-mono text-[11px]", security?.pendingReboot ? "text-warning" : "text-foreground")}>
                {security?.pendingReboot ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Activation</span>
              <span className="font-mono text-[11px] text-foreground">
                {snapshot.activation?.status === 1 ? "Licensed" : snapshot.activation ? `Status ${snapshot.activation.status}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Last boot</span>
              <span className="font-mono text-[11px] text-foreground">
                {formatDateTime(parseIso(os?.lastBoot ?? null))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {snapshot.storage.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Storage health</h2>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[52rem] table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Drive</th>
                  <th className="px-3 py-2 font-medium">Health</th>
                  <th className="px-3 py-2 font-medium">Temp</th>
                  <th className="px-3 py-2 font-medium">Power-on hours</th>
                  <th className="px-3 py-2 font-medium">Wear</th>
                  <th className="px-3 py-2 font-medium">Read err (uncorr)</th>
                  <th className="px-3 py-2 font-medium">Write err (uncorr)</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.storage.map((disk, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2">
                      <span className="block text-[11px] font-medium text-foreground">{disk.friendlyName ?? "—"}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {disk.mediaType === 4 ? "SSD" : disk.mediaType === 3 ? "HDD" : "Unknown"} · {disk.busType ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2"><StorageHealthBadge disk={disk} /></td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.temperature !== null ? `${disk.temperature}°C` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.powerOnHours !== null ? disk.powerOnHours.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.wear !== null ? `${disk.wear}%` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.readErrorsUncorrected !== null ? disk.readErrorsUncorrected.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.writeErrorsUncorrected !== null ? disk.writeErrorsUncorrected.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                      {disk.sizeBytes ? formatBytes(disk.sizeBytes) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.smartFailures.length > 0 ? (
            <p className="text-[11px] text-critical">
              {snapshot.smartFailures.length} SMART predictive failure{snapshot.smartFailures.length === 1 ? "" : "s"} reported.
            </p>
          ) : null}
        </section>
      ) : null}

      {snapshot.deviceProblems.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Devices with problems</h2>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Manufacturer</th>
                  <th className="px-3 py-2 font-medium">Error code</th>
                  <th className="px-3 py-2 font-medium">Device ID</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.deviceProblems.map((device, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2 text-[11px] font-medium text-foreground">{device.name ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{device.manufacturer ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-critical">{device.errorCode ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground break-all">{device.deviceId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {snapshot.reliability.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Reliability records</h2>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="w-40 px-4 py-2 font-medium">When</th>
                  <th className="w-44 px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.reliability.slice(0, 25).map((record, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2 font-mono text-[11px] tabular-nums text-foreground">
                      {formatDateTime(parseIso(record.time))}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-foreground">{record.productName ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{record.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Event timeline</h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {filteredEvents.length} of {snapshot.events.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-border-subtle pb-2">
          {EVENT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-colors duration-[120ms] ease-soft",
                category === cat
                  ? "bg-surface-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        {filteredEvents.length === 0 ? (
          <div className="border border-border p-4 text-[11px] text-muted-foreground">
            No events in this category.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[52rem] table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="w-40 px-4 py-2 font-medium">When</th>
                  <th className="w-24 px-3 py-2 font-medium">Level</th>
                  <th className="w-24 px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="w-40 px-3 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 200).map((event, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2 font-mono text-[11px] tabular-nums text-foreground">
                      {formatDateTime(event.time)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-foreground">{event.level}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{event.category}</td>
                    <td className="px-3 py-2 text-[11px] text-foreground">{event.headline}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {event.provider} · {event.eventId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setSoftwareOpen((open) => !open)}
          className="flex items-center justify-between border border-border-subtle bg-surface-muted px-4 py-2 text-[12px] font-medium text-foreground"
        >
          <span>Installed software ({snapshot.softwareCount}) and drivers ({snapshot.drivers.length})</span>
          <span className="text-muted-foreground">{softwareOpen ? "Hide" : "Show"}</span>
        </button>
        {softwareOpen ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[28rem] table-fixed border-collapse text-left">
                <thead>
                  <tr className="text-[10px] font-medium text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Version</th>
                    <th className="px-3 py-2 font-medium">Publisher</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.software.slice(0, 100).map((app, index) => (
                    <tr key={index} className="border-t border-border-subtle">
                      <td className="px-4 py-2 text-[11px] text-foreground">{app.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{app.version ?? "—"}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">{app.publisher ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[28rem] table-fixed border-collapse text-left">
                <thead>
                  <tr className="text-[10px] font-medium text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">Version</th>
                    <th className="px-3 py-2 font-medium">Signer</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.drivers.slice(0, 100).map((driver, index) => (
                    <tr key={index} className="border-t border-border-subtle">
                      <td className="px-4 py-2 text-[11px] text-foreground">{driver.deviceName ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{driver.driverVersion ?? "—"}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">{driver.signer ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Button variant="quiet" onClick={refresh}>
          Refresh
        </Button>
      </div>
    </Screen>
  );
}