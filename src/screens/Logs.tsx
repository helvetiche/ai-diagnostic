import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CheckCircleIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { useLogs } from "@/hooks/useLogs";
import { consumePendingLogSection } from "@/lib/logSection";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";


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

function Badge({
  icon,
  children,
  tone = "muted",
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: "success" | "warning" | "critical" | "info" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "critical"
          ? "text-critical"
          : tone === "info"
            ? "text-info"
            : "text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3",
        toneClass,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function LogsSkeleton() {
  return (
    <Screen>
      <div aria-busy="true" className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
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

export function Logs({ view = "all" }: { view?: "all" | "reliability" | "events" | "devices" }) {
  const { snapshot, status, error, refresh } = useLogs();
  const [category, setCategory] = useState<EventCategory>("All");
  const [reliabilitySearch, setReliabilitySearch] = useState("");
  const [reliabilityFilter, setReliabilityFilter] = useState<"All" | "Crash" | "Failed">("All");
  const [softwareOpen, setSoftwareOpen] = useState(false);
  const [devicesPage, setDevicesPage] = useState(0);
  const [reliabilityPage, setReliabilityPage] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [softwarePage, setSoftwarePage] = useState(0);

  const reliabilityRef = useRef<HTMLElement>(null);
  const eventsRef = useRef<HTMLElement>(null);
  const devicesRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setReliabilityPage(0);
  }, [reliabilitySearch, reliabilityFilter]);

  useEffect(() => {
    const section = consumePendingLogSection();
    if (!section) {
      return;
    }
    const target =
      section === "reliability"
        ? reliabilityRef.current
        : section === "events"
          ? eventsRef.current
          : section === "devices"
            ? devicesRef.current
            : null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [snapshot, status]);

  const filteredEvents = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    if (category === "All") {
      return snapshot.events;
    }
    return snapshot.events.filter((event) => event.category === category);
  }, [snapshot, category]);

  const filteredReliability = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = reliabilitySearch.trim().toLowerCase();
    return snapshot.reliability.filter((record) => {
      const isCrash = /crash|fail|error|stop/i.test(record.message ?? "");
      if (reliabilityFilter === "Crash" && !isCrash) {
        return false;
      }
      if (reliabilityFilter === "Failed" && isCrash) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [record.productName, record.message, record.sourceName, String(record.eventIdentifier ?? "")]
        .some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [snapshot, reliabilitySearch, reliabilityFilter]);

  const showAll = view === "all";

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

      {showAll && snapshot.storage.length > 0 ? (
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
                      <span className="block truncate text-[11px] font-medium text-foreground" title={disk.friendlyName ?? undefined}>{disk.friendlyName ?? "—"}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {disk.mediaType === 4 ? "SSD" : disk.mediaType === 3 ? "HDD" : "Unknown"} · {disk.busType ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {disk.smartPredictFailure === true ? (
                        <Badge icon={<WarningIcon size={10} weight="fill" />} tone="critical">SMART warning</Badge>
                      ) : disk.healthStatus !== null && disk.healthStatus !== 0 ? (
                        <Badge icon={<WarningIcon size={10} weight="fill" />} tone="warning">Degraded</Badge>
                      ) : disk.healthStatus === 0 ? (
                        <Badge icon={<CheckCircleIcon size={10} weight="fill" />} tone="success">Healthy</Badge>
                      ) : (
                        <Badge icon={<WarningIcon size={10} weight="fill" />} tone="muted">Unknown</Badge>
                      )}
                    </td>
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

      {(view === "devices" || showAll) && snapshot.deviceProblems.length > 0 ? (
        <section ref={devicesRef} className="flex flex-col gap-3">
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
                {snapshot.deviceProblems.slice(devicesPage * 10, devicesPage * 10 + 10).map((device, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2 text-[11px] font-medium text-foreground">
                      <span className="block truncate" title={device.name ?? undefined}>{device.name ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      <span className="block truncate" title={device.manufacturer ?? undefined}>{device.manufacturer ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-critical">{device.errorCode ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      <span className="block truncate" title={device.deviceId ?? undefined}>{device.deviceId ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.deviceProblems.length > 10 ? (
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                Page {devicesPage + 1} of {Math.max(1, Math.ceil(snapshot.deviceProblems.length / 10))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={devicesPage === 0}
                  onClick={() => setDevicesPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden={true} />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={devicesPage >= Math.ceil(snapshot.deviceProblems.length / 10) - 1}
                  onClick={() => setDevicesPage((p) => p + 1)}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  Next
                  <CaretDoubleRightIcon size={12} weight="fill" aria-hidden={true} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {(view === "reliability" || showAll) && snapshot.reliability.length > 0 ? (
        <section ref={reliabilityRef} className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Reliability records</h2>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="w-64 px-4 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.reliability.slice(reliabilityPage * 10, reliabilityPage * 10 + 10).map((record, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-4 py-2">
                      <span className="block truncate text-[11px] font-medium text-foreground" title={record.productName ?? undefined}>
                        {record.productName ?? "—"}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3",
                            /crash|fail|error|stop/i.test(record.message ?? "") ? "text-critical" : "text-warning",
                          )}
                        >
                          {/crash|fail|error|stop/i.test(record.message ?? "") ? (
                            <XCircleIcon size={10} weight="fill" />
                          ) : (
                            <WarningIcon size={10} weight="fill" />
                          )}
                          {/crash|fail|error|stop/i.test(record.message ?? "") ? "Crash" : "Failed"}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatRelative(parseIso(record.time))}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      <span className="block truncate" title={record.message ?? undefined}>
                        {record.message ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.reliability.length > 10 ? (
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                Page {reliabilityPage + 1} of {Math.max(1, Math.ceil(snapshot.reliability.length / 10))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={reliabilityPage === 0}
                  onClick={() => setReliabilityPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden={true} />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={reliabilityPage >= Math.ceil(snapshot.reliability.length / 10) - 1}
                  onClick={() => setReliabilityPage((p) => p + 1)}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  Next
                  <CaretDoubleRightIcon size={12} weight="fill" aria-hidden={true} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {(view === "events" || showAll) ? (
        <section ref={eventsRef} className="flex flex-col gap-3">
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
          <>
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
                    {filteredEvents.slice(eventsPage * 10, eventsPage * 10 + 10).map((event, index) => (
                      <tr key={index} className="border-t border-border-subtle">
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3",
                                event.level === "Critical" || event.level === "Error"
                                  ? "text-critical"
                                  : event.level === "Warning"
                                    ? "text-warning"
                                    : "text-success",
                              )}
                            >
                              {event.level === "Critical" || event.level === "Error" ? (
                                <XCircleIcon size={10} weight="fill" />
                              ) : event.level === "Warning" ? (
                                <WarningIcon size={10} weight="fill" />
                              ) : (
                                <CheckCircleIcon size={10} weight="fill" />
                              )}
                              {event.level}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-foreground">
                              {formatDateTime(event.time)}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-foreground">{event.level}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{event.category}</td>
                        <td className="px-3 py-2 text-[11px] text-foreground">
                        <span className="block truncate" title={event.headline}>{event.headline}</span>
                      </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {event.provider} · {event.eventId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            {filteredEvents.length > 10 ? (
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>
                  Page {eventsPage + 1} of {Math.max(1, Math.ceil(filteredEvents.length / 10))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={eventsPage === 0}
                    onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden={true} />
                    <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden={true} />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={eventsPage >= Math.ceil(filteredEvents.length / 10) - 1}
                    onClick={() => setEventsPage((p) => p + 1)}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    Next
                    <CaretDoubleRightIcon size={12} weight="fill" aria-hidden={true} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      ) : null}

      {showAll ? (
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
            <div className="flex flex-col gap-2">
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
                    {snapshot.software.slice(softwarePage * 10, softwarePage * 10 + 10).map((app, index) => (
                      <tr key={index} className="border-t border-border-subtle">
                        <td className="px-4 py-2 text-[11px] text-foreground">
                          <span className="block truncate" title={app.name ?? undefined}>{app.name ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{app.version ?? "—"}</td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground">
                          <span className="block truncate" title={app.publisher ?? undefined}>{app.publisher ?? "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {snapshot.software.length > 10 ? (
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>
                    Page {softwarePage + 1} of {Math.max(1, Math.ceil(snapshot.software.length / 10))}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={softwarePage === 0}
                      onClick={() => setSoftwarePage((p) => Math.max(0, p - 1))}
                      className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                    >
                      <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden={true} />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={softwarePage >= Math.ceil(snapshot.software.length / 10) - 1}
                      onClick={() => setSoftwarePage((p) => p + 1)}
                      className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                    >
                      Next
                      <CaretDoubleRightIcon size={12} weight="fill" aria-hidden={true} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
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
                    {snapshot.drivers.slice(softwarePage * 10, softwarePage * 10 + 10).map((driver, index) => (
                      <tr key={index} className="border-t border-border-subtle">
                        <td className="px-4 py-2 text-[11px] text-foreground">
                          <span className="block truncate" title={driver.deviceName ?? undefined}>{driver.deviceName ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{driver.driverVersion ?? "—"}</td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground">
                          <span className="block truncate" title={driver.signer ?? undefined}>{driver.signer ?? "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      <div className="flex justify-end">
        <Button variant="quiet" onClick={refresh}>
          Refresh
        </Button>
      </div>
    </Screen>
  );
}
