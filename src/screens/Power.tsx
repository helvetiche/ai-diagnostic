import {
  ArrowClockwiseIcon,
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ListBulletsIcon,
  LightningIcon,
  MoonIcon,
  PowerIcon,
  PulseIcon,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState, type KeyboardEvent } from "react";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Meter } from "@/components/primitives/Meter";
import { Panel } from "@/components/primitives/Panel";

import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { StatusMark, type MarkTone } from "@/components/primitives/StatusMark";
import { usePowerHistory } from "@/hooks/usePowerHistory";
import { formatDateTime, formatUptime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PowerRecord } from "@/types/power";

const TAB_KEYS = ["summary", "shutdowns", "restarts", "power-offs"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  summary: "Summary",
  shutdowns: "Shutdowns",
  restarts: "Restarts",
  "power-offs": "Power offs",
};

const TAB_ICONS: Record<TabKey, typeof ListBulletsIcon> = {
  summary: ListBulletsIcon,
  shutdowns: PowerIcon,
  restarts: ArrowClockwiseIcon,
  "power-offs": LightningIcon,
};

function Timestamp({ value, className }: { value: number | null; className?: string }) {
  return (
    <time
      dateTime={value === null ? undefined : new Date(value).toISOString()}
      className={className}
    >
      {formatDateTime(value)}
    </time>
  );
}

function ErrorBanner({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <Panel className="bg-critical-soft p-4">
      <h2 className="text-[13px] font-medium text-critical">{title}</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-4 text-critical">{detail}</p>
      {onRetry ? (
        <Button variant="quiet" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Panel>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="border border-border p-5">
      <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
    </section>
  );
}

function kindLabel(record: PowerRecord): string {
  if (record.kind === "shutdown") {
    return record.isStop ? "Shutdown" : "Shutdown request";
  }

  if (record.kind === "restart") {
    return record.isStop ? "Restart" : "Restart request";
  }

  if (record.kind === "clean-stop") {
    return "Clean stop";
  }

  if (record.kind === "bugcheck") {
    return "Stop error";
  }

  return "Unexpected stop";
}

function severityTone(severity: PowerRecord["severity"]): MarkTone {
  if (severity === "critical") {
    return "critical";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "success";
}

function severityLabel(severity: PowerRecord["severity"]): string {
  if (severity === "critical") {
    return "Critical";
  }

  if (severity === "warning") {
    return "Moderate";
  }

  return "Safe";
}

function timeQualifier(record: PowerRecord): string | null {
  const note = record.timeNote;

  if (!note) {
    return null;
  }

  if (note.startsWith("Approximate.")) {
    return "Approximate";
  }

  if (note.startsWith("Request time.")) {
    return "Request time";
  }

  if (note.startsWith("Clean stop recorded. The stop time was not recorded.")) {
    return "Request time";
  }

  if (note.startsWith("Logged at the next boot") || note.startsWith("Logged after the next boot")) {
    return "Next boot";
  }

  if (note.includes("time was not recorded")) {
    return "Time missing";
  }

  if (note.startsWith("Clean stop")) {
    return "Clean stop";
  }

  return null;
}

function RecordDetail({ record }: { record: PowerRecord }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {record.timeNote ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          <span className="font-medium text-foreground">Time:</span> {record.timeNote}
        </p>
      ) : null}

      <p className="text-[11px] leading-4 text-muted-foreground">{record.detail}</p>

      {record.facts.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {record.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="min-w-0">
              <dt className="text-[10px] font-medium text-muted-foreground">{fact.label}</dt>
              <dd className="mt-0.5 font-mono text-[11px] break-words text-foreground">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {record.events.length > 0 ? (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground">Evidence</p>
          <ul className="mt-1.5 flex flex-col">
            {record.events.map((event, index) => (
              <li
                key={`${event.recordId}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle py-1.5 text-[11px] last:border-b-0"
              >
                <span className="text-muted-foreground">{event.role}</span>
                <span className="font-mono text-foreground">
                  {event.provider} · Event {event.eventId} · Record {event.recordId}
                </span>
                <Timestamp
                  value={event.time}
                  className="font-mono tabular-nums text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RecordTable({
  label,
  records,
  emptyTitle,
  pageSize,
}: {
  label: string;
  records: PowerRecord[];
  emptyTitle: string;
  pageSize?: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [records]);

  const pageSizeValue = pageSize && pageSize > 0 ? pageSize : records.length;
  const totalPages = Math.max(1, Math.ceil(records.length / pageSizeValue));
  const safePage = Math.min(page, totalPages - 1);
  const pageRecords = records.slice(
    safePage * pageSizeValue,
    safePage * pageSizeValue + pageSizeValue,
  );

  if (records.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <section className="overflow-x-auto border border-border">
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="text-[10px] font-medium text-muted-foreground">
            <th scope="col" className="w-[12.5rem] px-4 py-2 font-medium">
              When
            </th>
            <th scope="col" className="w-[10rem] px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Event
            </th>
            <th scope="col" className="w-20 px-3 py-2 text-right font-medium">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRecords.map((record) => {
            const expanded = expandedId === record.id;
            const qualifier = timeQualifier(record);
            const detailId = `power-record-detail-${record.id}`;

            return (
              <Fragment key={record.id}>
                <tr className="border-t border-border-subtle align-middle transition-colors duration-[120ms] ease-soft hover:bg-surface-muted">
                  <td className="px-4 py-2">
                    <Timestamp
                      value={record.time}
                      className="block font-mono text-[11px] tabular-nums text-foreground"
                    />
                    {qualifier ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {qualifier}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="block text-[11px] font-medium text-foreground">
                      {kindLabel(record)}
                    </span>
                    <StatusMark
                      tone={severityTone(record.severity)}
                      labelTone={record.severity !== "info"}
                      className="mt-0.5"
                    >
                      {severityLabel(record.severity)}
                    </StatusMark>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] leading-4 font-medium text-foreground">
                      {record.headline}
                    </span>
                  </td>
                  <td className="px-2 py-0 text-right">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      aria-label={`${expanded ? "Hide" : "View"} details for ${record.headline}`}
                      onClick={() => setExpandedId(expanded ? null : record.id)}
                      className="inline-flex min-h-10 items-center px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
                    >
                      {expanded ? "Hide" : "View"}
                    </button>
                  </td>
                </tr>
                <tr
                  id={detailId}
                  hidden={!expanded}
                  className="border-t border-border-subtle bg-surface-muted"
                >
                  <td colSpan={4} className="px-4 py-4">
                    {expanded ? <RecordDetail record={record} /> : null}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {pageSize && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            Page {safePage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <CaretDoubleLeftIcon size={12} aria-hidden="true" />
              Prev
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            >
              Next
              <CaretDoubleRightIcon size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PowerSkeleton() {
  return (
    <Screen>
      <div aria-busy="true" className="flex flex-col gap-5">
        <div className="flex items-center gap-6 border-b border-border-subtle">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-h-10 items-center gap-2">
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2.5 w-4" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 divide-x divide-y divide-border-subtle border border-border [&>div]:flex [&>div]:flex-col [&>div]:gap-3 [&>div]:p-3 sm:[&>div]:p-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mt-2 h-1.5 w-full" />
            </div>
          ))}
        </div>

        <div className="border border-border">
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 flex-1" />
            <Skeleton className="h-2.5 w-10" />
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading power history</span>
    </Screen>
  );
}

export function Power() {
  const { snapshot, status, error, refresh } = usePowerHistory();
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

  const powerStatus =
    !snapshot || snapshot.uptimeSeconds === null
      ? "Unknown"
      : snapshot.uptimeSeconds >= 7 * 86400
        ? "Restart recommended"
        : "Normal";

  const powerStatusClass =
    powerStatus === "Restart recommended"
      ? "text-warning"
      : powerStatus === "Unknown"
        ? "text-muted-foreground"
        : "text-success";

  const counts: Record<TabKey, number | null> = {
    summary: null,
    shutdowns: snapshot?.shutdowns.length ?? null,
    restarts: snapshot?.restarts.length ?? null,
    "power-offs": snapshot?.powerOffs.length ?? null,
  };

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: TabKey) {
    const index = TAB_KEYS.indexOf(current);
    let next: TabKey | null = null;

    if (event.key === "ArrowRight") {
      next = TAB_KEYS[(index + 1) % TAB_KEYS.length];
    } else if (event.key === "ArrowLeft") {
      next = TAB_KEYS[(index - 1 + TAB_KEYS.length) % TAB_KEYS.length];
    } else if (event.key === "Home") {
      next = TAB_KEYS[0];
    } else if (event.key === "End") {
      next = TAB_KEYS[TAB_KEYS.length - 1];
    }

    if (next) {
      event.preventDefault();
      setActiveTab(next);
      document.getElementById(`power-tab-${next}`)?.focus();
    }
  }

  if (status === "loading" && !snapshot) {
    return <PowerSkeleton />;
  }

  if (status === "error" && !snapshot) {
    return (
      <Screen>
        <StateView
          title="Power history unavailable"
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
        <ErrorBanner
          title="The refresh failed"
          detail={
            error ??
            "The last successful read is still shown. Try again when the desktop app is available."
          }
          onRetry={refresh}
        />
      ) : null}

      {snapshot.logError ? (
        <ErrorBanner
          title="The System log could not be read"
          detail={`${snapshot.logError} Uptime still works, but event history is unavailable.`}
        />
      ) : null}

      <div
        role="tablist"
        aria-label="Power history"
        className="flex items-center gap-6 border-b border-border-subtle"
      >
        {TAB_KEYS.map((key) => {
          const count = counts[key];
          const current = activeTab === key;
          const Icon = TAB_ICONS[key];

          return (
            <button
              key={key}
              id={`power-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={current}
              aria-controls={`power-panel-${key}`}
              tabIndex={current ? 0 : -1}
              onClick={() => setActiveTab(key)}
              onKeyDown={(event) => handleTabKeyDown(event, key)}
              className={cn(
                "relative -mb-px flex min-h-10 items-center gap-2 text-[12px] font-medium whitespace-nowrap transition-colors duration-[120ms] ease-soft",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:rounded-full after:bg-primary after:transition-transform after:duration-200 after:ease-soft",
                current
                  ? "text-foreground after:scale-x-100"
                  : "text-muted-foreground after:scale-x-0 hover:text-foreground",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {TAB_LABELS[key]}
              {count === null ? null : (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 divide-x divide-y divide-border-subtle border border-border">
        <div className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <ClockIcon size={12} aria-hidden="true" />
              Uptime
            </span>
            <span
              className={`inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 capitalize ${powerStatusClass}`}
            >
              {powerStatus === "Restart recommended" ? (
                <ArrowClockwiseIcon size={10} aria-hidden="true" />
              ) : (
                <CheckCircleIcon size={10} aria-hidden="true" />
              )}
              {powerStatus}
            </span>
          </div>
          <span className="font-mono text-[20px] leading-none tabular-nums text-foreground">
            {snapshot.uptimeSeconds === null ? "—" : formatUptime(snapshot.uptimeSeconds)}
          </span>
          <div
            title={
              powerStatus === "Restart recommended"
                ? "Uptime exceeded 7 days. Restart recommended."
                : "Uptime under 7 days. Normal."
            }
          >
            <Meter
              className="mt-2"
              label="Uptime progress"
              value={snapshot.uptimeSeconds ?? 0}
              max={7 * 86_400}
              tone={powerStatus === "Restart recommended" ? "warning" : "success"}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <PulseIcon size={12} aria-hidden="true" />
              Active time
            </span>
            <span className="inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 capitalize text-success">
              <CheckCircleIcon size={10} aria-hidden="true" />
              Normal
            </span>
          </div>
          <span className="font-mono text-[20px] leading-none tabular-nums text-foreground">
            {snapshot.activeSeconds === null ? "—" : formatUptime(snapshot.activeSeconds)}
          </span>
          <div title="Active time under 7 days. Normal.">
            <Meter
              className="mt-2"
              label="Active time progress"
              value={snapshot.activeSeconds ?? 0}
              max={7 * 86_400}
              tone="success"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MoonIcon size={12} aria-hidden="true" />
              Sleep time
            </span>
            <span className="inline-flex items-center gap-1 border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 capitalize text-success">
              <CheckCircleIcon size={10} aria-hidden="true" />
              Normal
            </span>
          </div>
          <span className="font-mono text-[20px] leading-none tabular-nums text-foreground">
            {snapshot.sleepSeconds === null ? "—" : formatUptime(snapshot.sleepSeconds)}
          </span>
          <div title="Sleep time under 7 days. Normal.">
            <Meter
              className="mt-2"
              label="Sleep time progress"
              value={snapshot.sleepSeconds ?? 0}
              max={7 * 86_400}
              tone="success"
            />
          </div>
        </div>
      </div>

      <div
        id="power-panel-summary"
        role="tabpanel"
        aria-labelledby="power-tab-summary"
        hidden={activeTab !== "summary"}
      >
        {snapshot ? (
          <RecordTable
            label="Critical power records"
            records={[
              ...snapshot.shutdowns,
              ...snapshot.restarts,
              ...snapshot.powerOffs,
              ...snapshot.unclassifiedStops,
            ].filter((record) => record.isStop && record.severity === "critical")}
            emptyTitle="No critical stops recorded"
            pageSize={5}
          />
        ) : (
          <section className="border border-border p-4 text-[11px] text-muted-foreground">
            Power history unavailable.
          </section>
        )}
      </div>

      <div
        id="power-panel-shutdowns"
        role="tabpanel"
        aria-labelledby="power-tab-shutdowns"
        className="flex flex-col gap-4"
        hidden={activeTab !== "shutdowns"}
      >
        {snapshot.fastStartup ? (
          <p className="px-1 text-[11px] leading-4 text-muted-foreground">
            Fast Startup is on. Some shutdowns can appear unconfirmed.
          </p>
        ) : null}
        <RecordTable
          label="Shutdown records"
          records={snapshot.shutdowns}
          emptyTitle="No shutdowns recorded"
        />
        {snapshot.unclassifiedStops.length > 0 ? (
          <div className="mt-2 flex flex-col gap-3">
            <h2 className="px-1 text-[13px] font-medium text-foreground">
              Clean stops without a request
            </h2>
            <RecordTable
              label="Clean stops without a request"
              records={snapshot.unclassifiedStops}
              emptyTitle="No clean stops without a request"
            />
          </div>
        ) : null}
      </div>

      <div
        id="power-panel-restarts"
        role="tabpanel"
        aria-labelledby="power-tab-restarts"
        className="flex flex-col gap-4"
        hidden={activeTab !== "restarts"}
      >
        <RecordTable
          label="Restart records"
          records={snapshot.restarts}
          emptyTitle="No restarts recorded"
        />
      </div>

      <div
        id="power-panel-power-offs"
        role="tabpanel"
        aria-labelledby="power-tab-power-offs"
        className="flex flex-col gap-4"
        hidden={activeTab !== "power-offs"}
      >
        <RecordTable
          label="Power-off records"
          records={snapshot.powerOffs}
          emptyTitle="No unexpected stops recorded"
        />
      </div>
    </Screen>
  );
}
