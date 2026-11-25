import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretDownIcon,
  ChatTextIcon,
  CheckCircleIcon,
  CubeIcon,
  HashIcon,
  MagnifyingGlassIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { useLogs } from "@/hooks/useLogs";
import type { LogsReliabilityRecord, LogsSnapshot } from "@/types/logs";
import BorderGlow from "@/components/BorderGlow";
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

function formatMetric(
  value: number | null,
  suffix = "",
  format?: (value: number) => string,
): string {
  if (value === null) {
    return "—";
  }
  return `${format ? format(value) : value}${suffix}`;
}

function parseIso(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowKey(value: object): string {
  return JSON.stringify(value);
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

function LogsAlerts({
  status,
  error,
  logError,
  onRefresh,
}: {
  status: "loading" | "ready" | "error";
  error: string | null;
  logError: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      {status === "error" ? (
        <Panel className="bg-critical-soft p-4">
          <h2 className="text-[13px] font-medium text-critical">The refresh failed</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-4 text-critical">
            {error ?? "The last successful read is still shown."}
          </p>
          <Button variant="quiet" className="mt-3" onClick={onRefresh}>
            Try again
          </Button>
        </Panel>
      ) : null}

      {logError ? (
        <Panel className="bg-warning-soft p-4">
          <h2 className="text-[13px] font-medium text-warning">Partial result</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-4 text-warning">{logError}</p>
        </Panel>
      ) : null}
    </>
  );
}

function StorageSection({ snapshot }: { snapshot: LogsSnapshot }) {
  if (snapshot.storage.length === 0) {
    return null;
  }

  return (
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
            {snapshot.storage.map((disk) => (
              <tr key={rowKey(disk)} className="border-t border-border-subtle">
                <td className="px-4 py-2">
                  <span
                    className="block truncate text-[11px] font-medium text-foreground"
                    title={disk.friendlyName ?? undefined}
                  >
                    {disk.friendlyName ?? "—"}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {disk.mediaType === 4 ? "SSD" : disk.mediaType === 3 ? "HDD" : "Unknown"} ·{" "}
                    {disk.busType ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {disk.smartPredictFailure === true ? (
                    <Badge icon={<WarningIcon size={10} weight="fill" />} tone="critical">
                      SMART warning
                    </Badge>
                  ) : disk.healthStatus !== null && disk.healthStatus !== 0 ? (
                    <Badge icon={<WarningIcon size={10} weight="fill" />} tone="warning">
                      Degraded
                    </Badge>
                  ) : disk.healthStatus === 0 ? (
                    <Badge icon={<CheckCircleIcon size={10} weight="fill" />} tone="success">
                      Healthy
                    </Badge>
                  ) : (
                    <Badge icon={<WarningIcon size={10} weight="fill" />} tone="muted">
                      Unknown
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {formatMetric(disk.temperature, "°C")}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {formatMetric(disk.powerOnHours, "", (value) => value.toLocaleString())}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {formatMetric(disk.wear, "%")}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {formatMetric(disk.readErrorsUncorrected, "", (value) => value.toLocaleString())}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {formatMetric(disk.writeErrorsUncorrected, "", (value) => value.toLocaleString())}
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
          {snapshot.smartFailures.length} SMART predictive failure
          {snapshot.smartFailures.length === 1 ? "" : "s"} reported.
        </p>
      ) : null}
    </section>
  );
}

function DevicesSection({
  snapshot,
  sectionRef,
}: {
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const [page, setPage] = useState(0);

  if (snapshot.deviceProblems.length === 0) {
    return null;
  }

  return (
    <section ref={sectionRef} className="flex flex-col gap-3">
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
            {snapshot.deviceProblems.slice(page * 10, page * 10 + 10).map((device) => (
              <tr key={rowKey(device)} className="border-t border-border-subtle">
                <td className="px-4 py-2 text-[11px] font-medium text-foreground">
                  <span className="block truncate" title={device.name ?? undefined}>
                    {device.name ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="block truncate" title={device.manufacturer ?? undefined}>
                    {device.manufacturer ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-critical">
                  {device.errorCode ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  <span className="block truncate" title={device.deviceId ?? undefined}>
                    {device.deviceId ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshot.deviceProblems.length > 10 ? (
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(snapshot.deviceProblems.length / 10))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= Math.ceil(snapshot.deviceProblems.length / 10) - 1}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              Next
              <CaretDoubleRightIcon size={12} weight="fill" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReliabilityRow({
  record,
  onSelect,
}: {
  record: LogsReliabilityRecord;
  onSelect: (record: LogsReliabilityRecord) => void;
}) {
  const isCrash = /crash|fail|error|stop/i.test(record.message ?? "");

  return (
    <tr
      tabIndex={0}
      className="cursor-pointer border-t border-border-subtle transition-colors duration-[120ms] ease-soft hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onSelect(record)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(record);
        }
      }}
    >
      <td className="px-4 py-2">
        <span
          className="block truncate text-[11px] font-medium text-foreground"
          title={record.productName ?? undefined}
        >
          {record.productName ?? "—"}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3",
              isCrash ? "text-critical" : "text-warning",
            )}
          >
            {isCrash ? (
              <XCircleIcon size={10} weight="fill" />
            ) : (
              <WarningIcon size={10} weight="fill" />
            )}
            {isCrash ? "Crash" : "Failed"}
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
      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
        {record.eventIdentifier ?? "—"}
      </td>
    </tr>
  );
}

function ReliabilityDrawer({
  record,
  closing,
  search,
  onSearch,
  onClose,
}: {
  record: LogsReliabilityRecord;
  closing: boolean;
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/60 duration-240",
          closing ? "animate-out fade-out" : "animate-in fade-in",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 h-screen w-1/2 overflow-x-hidden overflow-y-auto overscroll-contain border-l border-border bg-surface p-6 shadow-card duration-240",
          closing
            ? "animate-out fade-out slide-out-to-right-full"
            : "animate-in fade-in slide-in-from-right-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Reliability record</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
            aria-label="Close"
          >
            <XIcon size={14} weight="fill" aria-hidden />
          </button>
        </div>
        <div className="mt-4">
          <BorderGlow
            backgroundColor="#120F17"
            borderRadius={0}
            glowRadius={16}
            glowIntensity={0.8}
          >
            <div className="relative flex items-center">
              <MagnifyingGlassIcon
                size={13}
                className="pointer-events-none absolute left-3 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Ask AI"
                aria-label="Ask AI"
                className="w-full bg-transparent py-2 pl-9 pr-3 text-[12px] text-white/90 placeholder:text-white/50 focus:outline-none"
              />
            </div>
          </BorderGlow>
        </div>
        <dl className="mt-5 flex flex-col gap-3 text-[12px]">
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">Product</dt>
            <dd className="mt-1 text-foreground">{record.productName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">Message</dt>
            <dd className="mt-1 text-foreground">{record.message ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">Time</dt>
            <dd className="mt-1 font-mono text-foreground">{record.time ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">Source</dt>
            <dd className="mt-1 text-foreground">{record.sourceName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">Event identifier</dt>
            <dd className="mt-1 font-mono text-foreground">{record.eventIdentifier ?? "—"}</dd>
          </div>
        </dl>
      </aside>
    </>
  );
}

function ReliabilitySection({
  snapshot,
  sectionRef,
}: {
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Crash" | "Failed">("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<LogsReliabilityRecord | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [cabinetSearch, setCabinetSearch] = useState("");
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return snapshot.reliability.filter((record) => {
      const isCrash = /crash|fail|error|stop/i.test(record.message ?? "");
      if (filter === "Crash" && !isCrash) {
        return false;
      }
      if (filter === "Failed" && isCrash) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        record.productName,
        record.message,
        record.sourceName,
        String(record.eventIdentifier ?? ""),
      ].some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [snapshot, search, filter]);

  useEffect(() => {
    setPage(0);
  }, [search, filter]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        searchRef.current
      ) {
        event.preventDefault();
        searchRef.current.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function closeDrawer() {
    setDrawerClosing(true);
    window.setTimeout(() => {
      setSelected(null);
      setDrawerClosing(false);
    }, 240);
  }

  if (snapshot.reliability.length === 0) {
    return null;
  }

  return (
    <>
      <section ref={sectionRef} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[13px] font-medium text-foreground">Reliability records</h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {filtered.length} of {snapshot.reliability.length}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1">
            <MagnifyingGlassIcon
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, message, source"
              className="w-full bg-surface-muted py-2 pl-9 pr-16 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Search reliability records"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border border-border bg-surface-raised px-2 py-0.5 font-mono text-[10px] text-muted-foreground shadow-card">
              Ctrl+F
            </kbd>
          </div>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              className="flex items-center gap-2 bg-surface-muted px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              aria-label="Filter reliability records"
            >
              {filter}
              <CaretDownIcon size={10} weight="fill" aria-hidden />
            </button>
            {filterOpen ? (
              <div
                role="listbox"
                className="absolute right-0 top-full z-10 mt-1 min-w-[8rem] border border-border bg-surface shadow-card"
              >
                {(["All", "Crash", "Failed"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={filter === option}
                    onClick={() => {
                      setFilter(option);
                      setFilterOpen(false);
                    }}
                    className={cn(
                      "flex w-full px-3 py-2 text-left text-[12px] transition-colors duration-[120ms] ease-soft hover:bg-surface-muted",
                      filter === option ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="border border-border p-4 text-[11px] text-muted-foreground">
            No reliability records match the current search or filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
                <thead>
                  <tr className="text-[10px] font-medium text-muted-foreground">
                    <th className="w-64 px-4 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <CubeIcon size={11} aria-hidden />
                        Product
                      </span>
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <ChatTextIcon size={11} aria-hidden />
                        Message
                      </span>
                    </th>
                    <th className="w-28 px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <HashIcon size={11} aria-hidden />
                        Identifier
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * 10, page * 10 + 10).map((record) => (
                    <ReliabilityRow
                      key={rowKey(record)}
                      record={record}
                      onSelect={(next) => {
                        setDrawerClosing(false);
                        setSelected(next);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 10 ? (
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>
                  Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 10))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= Math.ceil(filtered.length / 10) - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    Next
                    <CaretDoubleRightIcon size={12} weight="fill" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      {selected ? (
        <ReliabilityDrawer
          record={selected}
          closing={drawerClosing}
          search={cabinetSearch}
          onSearch={setCabinetSearch}
          onClose={closeDrawer}
        />
      ) : null}
    </>
  );
}

function EventsSection({
  snapshot,
  sectionRef,
}: {
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const [category, setCategory] = useState<EventCategory>("All");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (category === "All") {
      return snapshot.events;
    }
    return snapshot.events.filter((event) => event.category === category);
  }, [snapshot, category]);

  return (
    <section ref={sectionRef} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-foreground">Event timeline</h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {filtered.length} of {snapshot.events.length}
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
      {filtered.length === 0 ? (
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
                {filtered.slice(page * 10, page * 10 + 10).map((event) => (
                  <tr key={event.recordId} className="border-t border-border-subtle">
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
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {event.category}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-foreground">
                      <span className="block truncate" title={event.headline}>
                        {event.headline}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {event.provider} · {event.eventId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 10 ? (
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 10))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden />
                  <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= Math.ceil(filtered.length / 10) - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  Next
                  <CaretDoubleRightIcon size={12} weight="fill" aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SoftwareSection({ snapshot }: { snapshot: LogsSnapshot }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-between border border-border-subtle bg-surface-muted px-4 py-2 text-[12px] font-medium text-foreground"
      >
        <span>
          Installed software ({snapshot.softwareCount}) and drivers ({snapshot.drivers.length})
        </span>
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
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
                  {snapshot.software.slice(page * 10, page * 10 + 10).map((app) => (
                    <tr key={rowKey(app)} className="border-t border-border-subtle">
                      <td className="px-4 py-2 text-[11px] text-foreground">
                        <span className="block truncate" title={app.name ?? undefined}>
                          {app.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {app.version ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        <span className="block truncate" title={app.publisher ?? undefined}>
                          {app.publisher ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {snapshot.software.length > 10 ? (
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>
                  Page {page + 1} of {Math.max(1, Math.ceil(snapshot.software.length / 10))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    <CaretDoubleLeftIcon size={12} weight="fill" aria-hidden />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= Math.ceil(snapshot.software.length / 10) - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1.5 border border-border-subtle bg-surface-muted px-3 py-1.5 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    Next
                    <CaretDoubleRightIcon size={12} weight="fill" aria-hidden />
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
                  {snapshot.drivers.slice(page * 10, page * 10 + 10).map((driver) => (
                    <tr key={rowKey(driver)} className="border-t border-border-subtle">
                      <td className="px-4 py-2 text-[11px] text-foreground">
                        <span className="block truncate" title={driver.deviceName ?? undefined}>
                          {driver.deviceName ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {driver.driverVersion ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        <span className="block truncate" title={driver.signer ?? undefined}>
                          {driver.signer ?? "—"}
                        </span>
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
  );
}

function LogUnavailable({ error, onRefresh }: { error: string | null; onRefresh: () => void }) {
  return (
    <Screen>
      <StateView
        title="System logs unavailable"
        code={error ?? "Unknown error"}
        action={
          <Button variant="primary" onClick={onRefresh}>
            Try again
          </Button>
        }
      />
    </Screen>
  );
}

function StorageView({ showAll, snapshot }: { showAll: boolean; snapshot: LogsSnapshot }) {
  if (!showAll) {
    return null;
  }

  return <StorageSection snapshot={snapshot} />;
}

function DevicesView({
  view,
  showAll,
  snapshot,
  sectionRef,
}: {
  view: "all" | "reliability" | "events" | "devices";
  showAll: boolean;
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  if (!showAll && view !== "devices") {
    return null;
  }

  return <DevicesSection snapshot={snapshot} sectionRef={sectionRef} />;
}

function ReliabilityView({
  view,
  showAll,
  snapshot,
  sectionRef,
}: {
  view: "all" | "reliability" | "events" | "devices";
  showAll: boolean;
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  if (!showAll && view !== "reliability") {
    return null;
  }

  return <ReliabilitySection snapshot={snapshot} sectionRef={sectionRef} />;
}

function EventsView({
  view,
  showAll,
  snapshot,
  sectionRef,
}: {
  view: "all" | "reliability" | "events" | "devices";
  showAll: boolean;
  snapshot: LogsSnapshot;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  if (!showAll && view !== "events") {
    return null;
  }

  return <EventsSection snapshot={snapshot} sectionRef={sectionRef} />;
}

function SoftwareView({ showAll, snapshot }: { showAll: boolean; snapshot: LogsSnapshot }) {
  if (!showAll) {
    return null;
  }

  return <SoftwareSection snapshot={snapshot} />;
}

export function Logs({ view = "all" }: { view?: "all" | "reliability" | "events" | "devices" }) {
  const { snapshot, status, error, refresh } = useLogs();
  const showAll = view === "all";
  const reliabilityRef = useRef<HTMLElement>(null);
  const eventsRef = useRef<HTMLElement>(null);
  const devicesRef = useRef<HTMLElement>(null);

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

  if (status === "loading" && !snapshot) {
    return <LogsSkeleton />;
  }

  if (status === "error" && !snapshot) {
    return <LogUnavailable error={error} onRefresh={refresh} />;
  }

  if (!snapshot) {
    return null;
  }

  return (
    <Screen>
      <LogsAlerts status={status} error={error} logError={snapshot.logError} onRefresh={refresh} />

      <StorageView showAll={showAll} snapshot={snapshot} />

      <DevicesView view={view} showAll={showAll} snapshot={snapshot} sectionRef={devicesRef} />

      <ReliabilityView
        view={view}
        showAll={showAll}
        snapshot={snapshot}
        sectionRef={reliabilityRef}
      />

      <EventsView view={view} showAll={showAll} snapshot={snapshot} sectionRef={eventsRef} />

      <SoftwareView showAll={showAll} snapshot={snapshot} />

      <div className="flex justify-end">
        <Button variant="quiet" onClick={refresh}>
          Refresh
        </Button>
      </div>
    </Screen>
  );
}
