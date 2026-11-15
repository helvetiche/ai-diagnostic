import { useMemo, useState, type KeyboardEvent } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";

import { usePowerHistory, type PowerHistoryStatus } from "@/hooks/usePowerHistory";
import { formatBytes, formatDateTime, formatUptime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PowerLogInfo, PowerRecord, PowerSnapshot } from "@/types/power";

const TAB_KEYS = ["uptime", "shutdowns", "restarts", "power-offs"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  uptime: "Uptime",
  shutdowns: "Shutdowns",
  restarts: "Restarts",
  "power-offs": "Power offs",
};

function Timestamp({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  return (
    <time
      dateTime={value === null ? undefined : new Date(value).toISOString()}
      className={className}
    >
      {formatDateTime(value)}
    </time>
  );
}

function StatusLine({
  status,
  capturedAt,
}: {
  status: PowerHistoryStatus;
  capturedAt?: number;
}) {
  const label =
    status === "loading"
      ? capturedAt === undefined
        ? "Reading the System log"
        : "Refreshing the System log"
      : status === "ready"
        ? `Read from the live System log · ${formatDateTime(capturedAt ?? null)}`
        : "Power history unavailable";

  return (
    <p
      role="status"
      className="mt-2 flex items-center gap-2 text-[11px] leading-4 font-medium text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0",
          status === "ready"
            ? "bg-success"
            : status === "error"
              ? "bg-critical"
              : "bg-muted-foreground",
        )}
      />
      {label}
    </p>
  );
}

function PageHeader({
  status,
  capturedAt,
  refreshing,
  onRefresh,
}: {
  status: PowerHistoryStatus;
  capturedAt?: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header>
      <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
        Workspace
      </p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground">
            Power
          </h1>
          <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            Uptime, shutdowns, restarts, and unexpected stops from the Windows
            System log.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex min-h-10 items-center gap-2 bg-surface px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent disabled:opacity-60"
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {refreshing ? "Reading" : "Refresh"}
        </button>
      </div>
      <StatusLine status={status} capturedAt={capturedAt} />
    </header>
  );
}

function PanelIntro({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
    </div>
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
    <section className="bg-critical-soft p-4">
      <h2 className="text-sm leading-5 font-semibold text-critical">{title}</h2>
      <p className="mt-1 max-w-lg text-xs leading-5 text-critical">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-10 bg-surface px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-surface-muted p-3">
      <dt className="text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-xs leading-5 break-words text-foreground">
        {value}
      </dd>
      <dd className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {note}
      </dd>
    </div>
  );
}

function FastStartupCard({ enabled }: { enabled: boolean | null }) {
  return (
    <section className="bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Fast Startup
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            A hybrid shutdown saves the kernel session to disk. That can make
            uptime look longer than the time since the PC was powered on.
          </p>
        </div>
        <span className="bg-surface-muted px-2 py-1 text-[11px] leading-4 font-medium text-foreground">
          {enabled === null ? "Unknown" : enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">
        {enabled === null
          ? "Windog could not read the Fast Startup setting. Uptime may not match the time since the PC was physically powered on."
          : enabled
            ? "Fast Startup is on. Uptime can include time from before the last physical power-on."
            : "Fast Startup is off. Each boot starts a new kernel session, so uptime starts at the last full boot."}
      </p>
    </section>
  );
}

function LastStopCard({ record }: { record: PowerRecord | null }) {
  return (
    <section className="bg-surface p-5">
      <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
        Last recorded stop
      </h2>
      <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
        The newest stop in the retained System log. Unconfirmed requests are
        excluded.
      </p>
      {record ? (
        <div className="mt-4 bg-surface-muted p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm leading-5 font-medium text-foreground">
              {record.headline}
            </p>
            <Timestamp
              value={record.time}
              className="font-mono text-[11px] leading-4 tabular-nums text-foreground"
            />
          </div>
          {record.timeNote ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {record.timeNote}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 max-w-lg text-xs leading-5 text-muted-foreground">
          No stop events are stored in the retained System log.
        </p>
      )}
    </section>
  );
}

function UptimePanel({
  snapshot,
  lastStop,
}: {
  snapshot: PowerSnapshot;
  lastStop: PowerRecord | null;
}) {
  const uptimeValue =
    snapshot.uptimeSeconds === null
      ? "Unavailable"
      : formatUptime(snapshot.uptimeSeconds);

  return (
    <>
      <section className="bg-surface p-5">
        <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Current session
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <p className="font-mono text-4xl leading-none tracking-[-0.04em] tabular-nums text-foreground">
            {uptimeValue}
          </p>
          <p className="max-w-xs text-[11px] leading-4 text-muted-foreground">
            {snapshot.uptimeSeconds === null
              ? "The uptime counter could not be read."
              : "Wall time since the last boot, including sleep."}
          </p>
        </div>
        <dl className="mt-5 grid gap-2 sm:grid-cols-3">
          <Metric
            label="Active time"
            value={
              snapshot.activeSeconds === null
                ? "Unavailable"
                : formatUptime(snapshot.activeSeconds)
            }
            note="Working state only. Excludes sleep and hibernation."
          />
          <Metric
            label="Sleep time"
            value={
              snapshot.sleepSeconds === null
                ? "Unavailable"
                : formatUptime(snapshot.sleepSeconds)
            }
            note="Wall uptime minus active time."
          />
          <Metric
            label="Boot time"
            value={formatDateTime(snapshot.bootTime)}
            note="Approximate. Derived from the uptime counter."
          />
        </dl>
      </section>

      <LastStopCard record={lastStop} />
      <FastStartupCard enabled={snapshot.fastStartup} />
    </>
  );
}

function CoverageNotice({
  log,
  truncated,
}: {
  log: PowerLogInfo | null;
  truncated: boolean;
}) {
  if (!log) {
    return (
      <p className="bg-surface px-4 py-3 text-[11px] leading-4 text-muted-foreground">
        Log retention details could not be read. Matching events still come
        from the live System log.
      </p>
    );
  }

  const missingEarlierRecords = log.oldestRecord > 1;

  return (
    <section className="bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          System log coverage
        </p>
        <p className="font-mono text-[10px] leading-4 text-muted-foreground">
          {log.recordCount.toLocaleString("en-US")} records ·{" "}
          {formatBytes(log.fileBytes)}
        </p>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Oldest record still stored:{" "}
        <Timestamp
          value={log.oldestTime}
          className="font-mono text-foreground"
        />
      </p>
      {missingEarlierRecords ? (
        <p className="mt-2 bg-warning-soft px-3 py-2 text-[11px] leading-4 text-warning">
          {log.full
            ? "The System log is full, so Windows overwrites the oldest records. Stops before the oldest record are gone."
            : "Earlier records are missing from this log. It may have been cleared. Stops before the oldest record are gone."}
        </p>
      ) : null}
      {truncated ? (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Showing the newest 500 matching events. Older matching events are not
          listed.
        </p>
      ) : null}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="bg-surface p-5">
      <h3 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
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

function severityColor(severity: PowerRecord["severity"]): string {
  if (severity === "critical") {
    return "text-critical";
  }

  if (severity === "warning") {
    return "text-warning";
  }

  return "text-muted-foreground";
}

function RecordCard({ record }: { record: PowerRecord }) {
  return (
    <article className="bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] leading-4 font-medium tracking-[0.06em] uppercase",
              severityColor(record.severity),
            )}
          >
            {kindLabel(record)}
          </p>
          <h3 className="mt-1 text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            {record.headline}
          </h3>
        </div>
        <div className="text-left sm:text-right">
          <Timestamp
            value={record.time}
            className="font-mono text-xs leading-5 tabular-nums text-foreground"
          />
          {record.timeNote ? (
            <p className="mt-0.5 max-w-[20rem] text-[11px] leading-4 text-muted-foreground">
              {record.timeNote}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 max-w-lg text-xs leading-5 text-muted-foreground">
        {record.detail}
      </p>

      {record.facts.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {record.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="min-w-0">
              <dt className="text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
                {fact.label}
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] leading-4 break-words text-foreground">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {record.events.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Evidence
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {record.events.map((event, index) => (
              <li
                key={`${event.recordId}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-surface-muted px-3 py-2"
              >
                <span className="text-[11px] leading-4 text-muted-foreground">
                  {event.role}
                </span>
                <span className="font-mono text-[10px] leading-4 text-foreground">
                  {event.provider} · Event {event.eventId} · Record{" "}
                  {event.recordId}
                </span>
                <Timestamp
                  value={event.time}
                  className="font-mono text-[10px] leading-4 tabular-nums text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function RecordList({
  records,
  emptyTitle,
  emptyDetail,
}: {
  records: PowerRecord[];
  emptyTitle: string;
  emptyDetail: string;
}) {
  if (records.length === 0) {
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {records.map((record) => (
        <li key={record.id}>
          <RecordCard record={record} />
        </li>
      ))}
    </ul>
  );
}

function GuideItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="bg-surface-muted p-3">
      <p className="text-xs leading-5 font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function PowerGuide() {
  return (
    <section className="bg-surface p-5">
      <h3 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
        Reading a power-off record
      </h3>
      <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
        These events describe what Windows recorded, not the cause. Check the
        facts on each record.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <GuideItem
          title="Stop code recorded"
          detail="Windows crashed. A driver, hardware, or power fault can cause it. The stop code narrows the search."
        />
        <GuideItem
          title="Long power button press"
          detail="Someone held the power button. That is physical input, not a software shutdown."
        />
        <GuideItem
          title="No code, no button"
          detail="Power loss, a hard reset, or a protective shutdown fits. Check the power cable, PSU, and cooling."
        />
      </div>
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        Event Log 6008 estimates the previous stop from the last timestamp
        Windows wrote. Treat that time as approximate.
      </p>
    </section>
  );
}

export function Power() {
  const { snapshot, status, error, refresh } = usePowerHistory();
  const [activeTab, setActiveTab] = useState<TabKey>("uptime");

  const lastStop = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const stops = [
      ...snapshot.shutdowns,
      ...snapshot.restarts,
      ...snapshot.powerOffs,
      ...snapshot.unclassifiedStops,
    ].filter((record) => record.isStop && record.time !== null);

    stops.sort((left, right) => (right.time ?? 0) - (left.time ?? 0));

    return stops[0] ?? null;
  }, [snapshot]);

  const counts: Record<TabKey, number | null> = {
    uptime: null,
    shutdowns: snapshot?.shutdowns.length ?? null,
    restarts: snapshot?.restarts.length ?? null,
    "power-offs": snapshot?.powerOffs.length ?? null,
  };

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    current: TabKey,
  ) {
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
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader status={status} refreshing onRefresh={refresh} />
        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Reading the System log
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            Uptime and the retained power events arrive together. Nothing is
            drawn until the read finishes.
          </p>
        </section>
      </div>
    );
  }

  if (status === "error" && !snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
        <PageHeader status={status} refreshing={false} onRefresh={refresh} />
        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Power history did not load
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            Power data comes from the desktop app. Run it with{" "}
            <span className="font-mono">npm run tauri dev</span>, not{" "}
            <span className="font-mono">npm run dev</span>.
          </p>
          <p className="mt-3 bg-surface-muted px-3 py-2 font-mono text-[11px] leading-4 break-words text-muted-foreground">
            {error ?? "Unknown error"}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 min-h-10 bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-[120ms] ease-soft hover:bg-primary/90"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
      <PageHeader
        status={status}
        capturedAt={snapshot.capturedAt}
        refreshing={status === "loading"}
        onRefresh={refresh}
      />

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
        className="flex flex-wrap gap-1 bg-surface p-1"
      >
        {TAB_KEYS.map((key) => {
          const count = counts[key];

          return (
            <button
              key={key}
              id={`power-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              aria-controls={`power-panel-${key}`}
              tabIndex={activeTab === key ? 0 : -1}
              onClick={() => setActiveTab(key)}
              onKeyDown={(event) => handleTabKeyDown(event, key)}
              className={cn(
                "flex min-h-10 items-center gap-2 px-3 text-xs font-medium transition-colors duration-[120ms] ease-soft",
                activeTab === key
                  ? "bg-surface-muted text-foreground shadow-item"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {TAB_LABELS[key]}
              {count === null ? null : (
                <span className="font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!snapshot.logError ? (
        <CoverageNotice log={snapshot.log} truncated={snapshot.truncated} />
      ) : null}

      <div
        id="power-panel-uptime"
        role="tabpanel"
        aria-labelledby="power-tab-uptime"
        hidden={activeTab !== "uptime"}
      >
        <div className="flex flex-col gap-6">
          <UptimePanel snapshot={snapshot} lastStop={lastStop} />
        </div>
      </div>

      <div
        id="power-panel-shutdowns"
        role="tabpanel"
        aria-labelledby="power-tab-shutdowns"
        hidden={activeTab !== "shutdowns"}
      >
        <div className="flex flex-col gap-6">
          <PanelIntro
            title="Shutdowns"
            detail="Shutdown requests Windows recorded, with the clean stop when one followed. Unconfirmed requests stay visible."
          />
          {snapshot.fastStartup ? (
            <p className="bg-surface px-4 py-3 text-[11px] leading-4 text-muted-foreground">
              Fast Startup is on. A normal shutdown hibernates the kernel session
              instead of stopping services, so it can log the request without a
              clean-stop event. A shutdown can stay listed as unconfirmed even
              when it completed.
            </p>
          ) : null}
          <RecordList
            records={snapshot.shutdowns}
            emptyTitle="No shutdown requests in the retained log"
            emptyDetail="Windows logs a request when a shutdown starts. A forced power off leaves no request; check Power offs for unexpected stops."
          />
          {snapshot.unclassifiedStops.length > 0 ? (
            <section className="flex flex-col gap-3">
              <PanelIntro
                title="Clean stops without a request"
                detail="Windows stopped the System log cleanly but did not record whether it was a shutdown or a restart."
              />
              <RecordList
                records={snapshot.unclassifiedStops}
                emptyTitle="No clean stops without a request"
                emptyDetail="Every clean stop in the retained log has a matching request."
              />
            </section>
          ) : null}
        </div>
      </div>

      <div
        id="power-panel-restarts"
        role="tabpanel"
        aria-labelledby="power-tab-restarts"
        hidden={activeTab !== "restarts"}
      >
        <div className="flex flex-col gap-6">
          <PanelIntro
            title="Restarts"
            detail="Restart requests Windows recorded, with the clean stop when one followed. Windows Update and app installers show up here too."
          />
          <RecordList
            records={snapshot.restarts}
            emptyTitle="No restart requests in the retained log"
            emptyDetail="Windows logs a request when a restart starts. An unexpected restart appears in Power offs instead."
          />
        </div>
      </div>

      <div
        id="power-panel-power-offs"
        role="tabpanel"
        aria-labelledby="power-tab-power-offs"
        hidden={activeTab !== "power-offs"}
      >
        <div className="flex flex-col gap-6">
          <PanelIntro
            title="Power offs"
            detail="Stops Windows could not pair with a clean shutdown. Kernel-Power 41 and Event Log 6008 normally appear after the next boot."
          />
          <PowerGuide />
          <RecordList
            records={snapshot.powerOffs}
            emptyTitle="No unexpected stops in the retained log"
            emptyDetail="A power loss only appears after the next boot. If the PC just lost power and has not restarted, there is nothing to read yet."
          />
        </div>
      </div>
    </div>
  );
}
