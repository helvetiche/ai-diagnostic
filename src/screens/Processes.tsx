import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  CaretDownIcon,
  CaretUpIcon,
  CpuIcon,
  GraphicsCardIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MemoryIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";

import { PageHeader, Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { StateView } from "@/components/primitives/StateView";
import { StatusMark } from "@/components/primitives/StatusMark";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Vitals } from "@/components/Vitals";
import { Sparkline } from "@/components/Sparkline";
import { useProcesses, type ProcessHistoryPoint } from "@/hooks/useProcesses";
import { useResourceStream } from "@/hooks/useResourceStream";
import { useThermalStream } from "@/hooks/useThermalStream";
import { formatBytes, formatPercent } from "@/lib/format";
import { loadToneClass } from "@/lib/loadLevel";
import { cn } from "@/lib/utils";
import type { ProcessSample } from "@/types/processes";
import type { ResourceSample } from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

type Band = "Low" | "Moderate" | "High" | "Critical";
type SortKey = "name" | "cpu" | "memory" | "gpu";

const BANDS: { id: Band; dot: string }[] = [
  { id: "Low", dot: "bg-success" },
  { id: "Moderate", dot: "bg-muted-foreground" },
  { id: "High", dot: "bg-warning" },
  { id: "Critical", dot: "bg-critical" },
];

const FIELD_CLASS =
  "h-10 w-full rounded-control bg-surface-muted px-3 text-[12px] text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const NUMBER_CLASS =
  "h-10 w-full rounded-control bg-surface-muted px-2.5 font-mono text-[11px] tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function processBand(value: number): Band {
  if (value >= 80) {
    return "Critical";
  }
  if (value >= 50) {
    return "High";
  }
  if (value >= 20) {
    return "Moderate";
  }
  return "Low";
}

function SortHeader({
  label,
  icon,
  active,
  direction,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1 text-[10px] font-medium transition-colors duration-[120ms] ease-soft",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          {icon}
        </span>
      ) : null}
      {label}
      {active ? (
        direction === "asc" ? (
          <CaretUpIcon size={10} aria-hidden="true" />
        ) : (
          <CaretDownIcon size={10} aria-hidden="true" />
        )
      ) : null}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === "") {
            onChange(0);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        className={cn(NUMBER_CLASS, "mt-1")}
      />
    </label>
  );
}

function LevelFilter({
  legend,
  selected,
  counts,
  onToggle,
}: {
  legend: string;
  selected: string[];
  counts: Record<Band, number>;
  onToggle: (band: string) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <fieldset>
      <legend className="text-[10px] font-medium text-muted-foreground">{legend}</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {BANDS.map((band) => (
          <label
            key={band.id}
            className="flex min-h-8 items-center gap-2 text-[11px] text-foreground"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(band.id)}
              onChange={() => onToggle(band.id)}
              className="size-3.5 accent-primary"
            />
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", band.dot)} />
            <span className="flex-1">{band.id}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {counts[band.id]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProcessFilterDialog({
  id,
  panelRef,
  levelFilter,
  onToggleLevel,
  minCpu,
  maxCpu,
  onMinCpu,
  onMaxCpu,
  gpuLevelFilter,
  onToggleGpuLevel,
  minGpu,
  maxGpu,
  onMinGpu,
  onMaxGpu,
  gpuOnly,
  onGpuOnly,
  counts,
  gpuCounts,
  activeCount,
  onReset,
  onCancel,
}: {
  id: string;
  panelRef: RefObject<HTMLDialogElement | null>;
  levelFilter: string[];
  onToggleLevel: (band: string) => void;
  minCpu: number;
  maxCpu: number;
  onMinCpu: (value: number) => void;
  onMaxCpu: (value: number) => void;
  gpuLevelFilter: string[];
  onToggleGpuLevel: (band: string) => void;
  minGpu: number;
  maxGpu: number;
  onMinGpu: (value: number) => void;
  onMaxGpu: (value: number) => void;
  gpuOnly: boolean;
  onGpuOnly: (value: boolean) => void;
  counts: Record<Band, number>;
  gpuCounts: Record<Band, number>;
  activeCount: number;
  onReset: () => void;
  onCancel: () => void;
}) {
  return (
    <dialog
      ref={panelRef}
      id={id}
      aria-label="Filter processes"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="pop-enter glass bottom-auto left-auto right-0 top-full z-30 m-0 mt-2 h-auto max-h-[min(70vh,34rem)] w-[20rem] overflow-y-auto rounded-panel border-0 p-4"
    >
      <LevelFilter
        legend="CPU level"
        selected={levelFilter}
        counts={counts}
        onToggle={onToggleLevel}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField label="Min CPU %" value={minCpu} onChange={onMinCpu} />
        <NumberField label="Max CPU %" value={maxCpu} onChange={onMaxCpu} />
      </div>

      <div className="mt-4 border-t border-border-subtle pt-3">
        <LevelFilter
          legend="GPU level"
          selected={gpuLevelFilter}
          counts={gpuCounts}
          onToggle={onToggleGpuLevel}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField label="Min GPU %" value={minGpu} onChange={onMinGpu} />
        <NumberField label="Max GPU %" value={maxGpu} onChange={onMaxGpu} />
      </div>

      <label className="mt-3 flex min-h-8 items-center gap-2 text-[11px] text-foreground">
        <input
          type="checkbox"
          checked={gpuOnly}
          onChange={(event) => onGpuOnly(event.target.checked)}
          className="size-3.5 accent-primary"
        />
        Has GPU usage
      </label>

      <Button
        variant="ghost"
        className="mt-3 w-full"
        onClick={onReset}
        disabled={activeCount === 0}
      >
        Reset filters
      </Button>
    </dialog>
  );
}

function ProcessMetric({
  values,
  color,
  min,
  max,
  children,
}: {
  values: number[];
  color: string;
  min?: number;
  max?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Sparkline
        className="box-content shrink-0 border border-border-subtle"
        values={values}
        color={color}
        min={min}
        max={max}
      />
      <div className="flex min-w-[3.5rem] items-baseline justify-end gap-1.5 whitespace-nowrap">
        {children}
      </div>
    </div>
  );
}

function VitalSkeletonCard({ variant }: { variant: number }) {
  return (
    <div data-variant={variant}>
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-4 w-10" />
      </div>
      {variant === 0 ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-20" />
          {variant === 1 ? <Skeleton className="h-2 w-16" /> : null}
        </div>
      )}
      {variant === 2 ? (
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-3 w-12" />
        </div>
      ) : (
        <Skeleton className="mt-2 h-1.5 w-full" />
      )}
      {variant === 3 ? <Skeleton className="h-3 w-12" /> : null}
    </div>
  );
}

function VitalsSkeleton() {
  return (
    <div
      aria-busy="true"
      data-loading="vitals"
      className="grid grid-cols-4 divide-x divide-border-subtle border border-border [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-3 [&>div]:p-3 sm:[&>div]:p-4"
    >
      <VitalSkeletonCard variant={0} />
      <VitalSkeletonCard variant={1} />
      <VitalSkeletonCard variant={2} />
      <VitalSkeletonCard variant={3} />
    </div>
  );
}

function useProcessFilterState(processes: ProcessSample[]) {
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [minCpu, setMinCpu] = useState(0);
  const [maxCpu, setMaxCpu] = useState(100);
  const [gpuOnly, setGpuOnly] = useState(false);
  const [gpuLevelFilter, setGpuLevelFilter] = useState<string[]>([]);
  const [minGpu, setMinGpu] = useState(0);
  const [maxGpu, setMaxGpu] = useState(100);
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const levelSet = useMemo(() => new Set(levelFilter), [levelFilter]);
  const gpuLevelSet = useMemo(() => new Set(gpuLevelFilter), [gpuLevelFilter]);

  useEffect(() => {
    setPage(0);
  }, [
    query,
    levelFilter,
    minCpu,
    maxCpu,
    gpuLevelFilter,
    minGpu,
    maxGpu,
    gpuOnly,
    sortKey,
    sortDir,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return processes.filter((process) => {
      if (q && !process.name.toLowerCase().includes(q)) {
        return false;
      }
      if (levelSet.size > 0 && !levelSet.has(processBand(process.cpu))) {
        return false;
      }
      if (process.cpu < minCpu || process.cpu > maxCpu) {
        return false;
      }
      if (gpuOnly && process.gpu === null) {
        return false;
      }
      if (process.gpu !== null) {
        if (gpuLevelSet.size > 0 && !gpuLevelSet.has(processBand(process.gpu))) {
          return false;
        }
        if (process.gpu < minGpu || process.gpu > maxGpu) {
          return false;
        }
      } else if (gpuLevelSet.size > 0) {
        return false;
      }
      return true;
    });
  }, [processes, query, levelSet, minCpu, maxCpu, gpuOnly, gpuLevelSet, minGpu, maxGpu]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      if (sortKey === "name") {
        result = a.name.localeCompare(b.name);
      } else if (sortKey === "cpu") {
        result = a.cpu - b.cpu;
      } else if (sortKey === "memory") {
        result = a.memory - b.memory;
      } else if (sortKey === "gpu") {
        result = (a.gpu ?? -1) - (b.gpu ?? -1);
      }
      return sortDir === "asc" ? result : -result;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const activeFilterCount =
    Number(Boolean(query.trim())) +
    levelFilter.length +
    Number(minCpu > 0) +
    Number(maxCpu < 100) +
    gpuLevelFilter.length +
    Number(minGpu > 0) +
    Number(maxGpu < 100) +
    Number(gpuOnly);

  const counts = useMemo<Record<Band, number>>(() => {
    const next: Record<Band, number> = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    for (const process of processes) {
      next[processBand(process.cpu)] += 1;
    }
    return next;
  }, [processes]);

  const gpuCounts = useMemo<Record<Band, number>>(() => {
    const next: Record<Band, number> = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    for (const process of processes) {
      if (process.gpu === null) {
        continue;
      }
      next[processBand(process.gpu)] += 1;
    }
    return next;
  }, [processes]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function toggleLevel(band: string) {
    setLevelFilter((current) =>
      current.includes(band) ? current.filter((item) => item !== band) : [...current, band],
    );
  }

  function toggleGpuLevel(band: string) {
    setGpuLevelFilter((current) =>
      current.includes(band) ? current.filter((item) => item !== band) : [...current, band],
    );
  }

  function resetFilters() {
    setLevelFilter([]);
    setMinCpu(0);
    setMaxCpu(100);
    setGpuLevelFilter([]);
    setMinGpu(0);
    setMaxGpu(100);
    setGpuOnly(false);
    setQuery("");
  }

  return {
    query,
    setQuery,
    filterOpen,
    setFilterOpen,
    levelFilter,
    minCpu,
    maxCpu,
    setMinCpu,
    setMaxCpu,
    gpuLevelFilter,
    minGpu,
    maxGpu,
    setMinGpu,
    setMaxGpu,
    gpuOnly,
    setGpuOnly,
    sortKey,
    sortDir,
    currentPage,
    totalPages,
    setPage,
    paginated,
    filteredCount: sorted.length,
    counts,
    gpuCounts,
    activeFilterCount,
    toggleSort,
    toggleLevel,
    toggleGpuLevel,
    resetFilters,
  };
}

function ProcessTable({
  rows,
  history,
  systemMemoryTotal,
  sortKey,
  sortDir,
  onSort,
  count,
  currentPage,
  totalPages,
  onPageChange,
}: {
  rows: ProcessSample[];
  history: Record<number, ProcessHistoryPoint[]>;
  systemMemoryTotal: number;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  count: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      <div className="overflow-x-auto border-t border-border-subtle">
        <table className="w-full min-w-[38rem] table-fixed">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="px-4 py-1 text-left">
                <SortHeader
                  label="Process"
                  icon={<ListBulletsIcon size={12} />}
                  active={sortKey === "name"}
                  direction={sortDir}
                  onClick={() => onSort("name")}
                />
              </th>
              <th scope="col" className="w-[11rem] px-3 py-1 text-right">
                <div className="flex justify-end">
                  <SortHeader
                    label="CPU"
                    icon={<CpuIcon size={12} />}
                    active={sortKey === "cpu"}
                    direction={sortDir}
                    onClick={() => onSort("cpu")}
                  />
                </div>
              </th>
              <th scope="col" className="w-[12rem] px-3 py-1 text-right">
                <div className="flex justify-end">
                  <SortHeader
                    label="Memory"
                    icon={<MemoryIcon size={12} />}
                    active={sortKey === "memory"}
                    direction={sortDir}
                    onClick={() => onSort("memory")}
                  />
                </div>
              </th>
              <th scope="col" className="w-[9rem] px-4 py-1 text-right">
                <div className="flex justify-end">
                  <SortHeader
                    label="GPU"
                    icon={<GraphicsCardIcon size={12} />}
                    active={sortKey === "gpu"}
                    direction={sortDir}
                    onClick={() => onSort("gpu")}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((process) => {
              const points = history[process.pid] ?? [];

              return (
                <tr
                  key={process.pid}
                  className="border-t border-border-subtle transition-colors duration-[120ms] ease-soft hover:bg-surface-muted"
                >
                  <td className="px-4 py-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[12px] text-foreground">{process.name}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {process.pid}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <ProcessMetric
                      values={points.map((point) => point.cpu)}
                      color="var(--chart-1)"
                      min={0}
                      max={100}
                    >
                      <span
                        className={cn(
                          "text-right font-mono text-[11px] tabular-nums",
                          loadToneClass(process.cpu),
                        )}
                      >
                        {formatPercent(process.cpu)}
                      </span>
                    </ProcessMetric>
                  </td>
                  <td className="px-3 py-2">
                    <ProcessMetric
                      values={points.map((point) =>
                        systemMemoryTotal > 0
                          ? (point.memory / systemMemoryTotal) * 100
                          : point.memory,
                      )}
                      color="var(--chart-2)"
                      min={0}
                      max={systemMemoryTotal > 0 ? 100 : undefined}
                    >
                      <span className="font-mono text-[11px] tabular-nums text-foreground">
                        {formatBytes(process.memory)}
                      </span>
                      {systemMemoryTotal > 0 ? (
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatPercent((process.memory / systemMemoryTotal) * 100)}
                        </span>
                      ) : null}
                    </ProcessMetric>
                  </td>
                  <td className="px-4 py-2">
                    <ProcessMetric
                      values={points
                        .map((point) => point.gpu)
                        .filter((value): value is number => value !== null)}
                      color="var(--chart-1)"
                      min={0}
                      max={100}
                    >
                      <span className="font-mono text-[11px] tabular-nums text-foreground">
                        {process.gpu === null ? "—" : formatPercent(process.gpu)}
                      </span>
                    </ProcessMetric>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {count === 1 ? "1 process" : `${count} processes`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            disabled={currentPage === 0}
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          >
            Previous
          </Button>
          <span className="px-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={currentPage >= totalPages - 1}
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}

function useFilterBehavior(filterOpen: boolean, setFilterOpen: (open: boolean) => void) {
  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }

    document.addEventListener("keydown", handleShortcut);

    return () => {
      document.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    if (!filterOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!filterRootRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFilterOpen(false);
        filterButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterOpen, setFilterOpen]);

  useEffect(() => {
    if (!filterOpen) {
      return;
    }

    const dialog = filterDialogRef.current;
    if (!dialog) {
      return;
    }

    if (!dialog.open) {
      dialog.show();
    }

    const focusTimer = window.setTimeout(() => dialog.querySelector("input")?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [filterOpen]);

  return { filterRootRef, filterDialogRef, filterButtonRef, searchRef };
}

function FilterCount({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return <span className="font-mono text-[10px] tabular-nums text-primary">{count}</span>;
}

function EmptyProcesses({ processCount, onReset }: { processCount: number; onReset: () => void }) {
  return (
    <div className="border-t border-border-subtle px-4 py-10 text-center">
      <p className="text-[12px] text-muted-foreground">
        {processCount === 0 ? "No processes reported." : "No process matches these filters."}
      </p>
      {processCount > 0 ? (
        <Button variant="ghost" className="mt-2" onClick={onReset}>
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}

function VitalsView({
  latest,
  thermalLatest,
}: {
  latest: ResourceSample | null;
  thermalLatest: ThermalSample | null;
}) {
  if (!latest) {
    return <VitalsSkeleton />;
  }

  return <Vitals latest={latest} thermal={thermalLatest} />;
}

function ProcessesErrorScreen({
  latest,
  thermalLatest,
  error,
  onRetry,
}: {
  latest: ResourceSample | null;
  thermalLatest: ThermalSample | null;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Screen>
      <PageHeader title="Processes">
        <StatusMark tone="critical">Unavailable</StatusMark>
      </PageHeader>
      <VitalsView latest={latest} thermalLatest={thermalLatest} />
      <StateView
        title="Process sampler unavailable"
        code={error ?? "Unknown error"}
        action={
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </Screen>
  );
}

function ProcessesLoadingScreen({
  latest,
  thermalLatest,
}: {
  latest: ResourceSample | null;
  thermalLatest: ThermalSample | null;
}) {
  return (
    <Screen>
      <PageHeader title="Processes">
        <StatusMark tone="muted">Starting</StatusMark>
      </PageHeader>
      <VitalsView latest={latest} thermalLatest={thermalLatest} />
      <StateView title="Starting process sampler" />
    </Screen>
  );
}

function FilterDialogSlot({
  open,
  levelFilter,
  onToggleLevel,
  minCpu,
  maxCpu,
  onMinCpu,
  onMaxCpu,
  gpuLevelFilter,
  onToggleGpuLevel,
  minGpu,
  maxGpu,
  onMinGpu,
  onMaxGpu,
  gpuOnly,
  onGpuOnly,
  counts,
  gpuCounts,
  activeCount,
  panelRef,
  onReset,
  onClose,
}: {
  open: boolean;
  levelFilter: string[];
  onToggleLevel: (band: string) => void;
  minCpu: number;
  maxCpu: number;
  onMinCpu: (value: number) => void;
  onMaxCpu: (value: number) => void;
  gpuLevelFilter: string[];
  onToggleGpuLevel: (band: string) => void;
  minGpu: number;
  maxGpu: number;
  onMinGpu: (value: number) => void;
  onMaxGpu: (value: number) => void;
  gpuOnly: boolean;
  onGpuOnly: (value: boolean) => void;
  counts: Record<Band, number>;
  gpuCounts: Record<Band, number>;
  activeCount: number;
  panelRef: RefObject<HTMLDialogElement | null>;
  onReset: () => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <ProcessFilterDialog
      id="process-filters"
      panelRef={panelRef}
      levelFilter={levelFilter}
      onToggleLevel={onToggleLevel}
      minCpu={minCpu}
      maxCpu={maxCpu}
      onMinCpu={onMinCpu}
      onMaxCpu={onMaxCpu}
      gpuLevelFilter={gpuLevelFilter}
      onToggleGpuLevel={onToggleGpuLevel}
      minGpu={minGpu}
      maxGpu={maxGpu}
      onMinGpu={onMinGpu}
      onMaxGpu={onMaxGpu}
      gpuOnly={gpuOnly}
      onGpuOnly={onGpuOnly}
      counts={counts}
      gpuCounts={gpuCounts}
      activeCount={activeCount}
      onReset={onReset}
      onCancel={onClose}
    />
  );
}

function ProcessResults({
  filteredCount,
  processCount,
  rows,
  history,
  systemMemoryTotal,
  sortKey,
  sortDir,
  onSort,
  currentPage,
  totalPages,
  onPageChange,
  onReset,
}: {
  filteredCount: number;
  processCount: number;
  rows: ProcessSample[];
  history: Record<number, ProcessHistoryPoint[]>;
  systemMemoryTotal: number;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onReset: () => void;
}) {
  if (filteredCount === 0) {
    return <EmptyProcesses processCount={processCount} onReset={onReset} />;
  }

  return (
    <ProcessTable
      rows={rows}
      history={history}
      systemMemoryTotal={systemMemoryTotal}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      count={filteredCount}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={onPageChange}
    />
  );
}

export function Processes() {
  const { processes, processHistory, status, error, retry } = useProcesses();
  const { samples } = useResourceStream();
  const { samples: thermalSamples } = useThermalStream();
  const latest = samples.at(-1) ?? null;
  const thermalLatest = thermalSamples.at(-1) ?? null;
  const systemMemoryTotal = latest?.memoryTotal ?? 0;

  const {
    query,
    setQuery,
    filterOpen,
    setFilterOpen,
    levelFilter,
    minCpu,
    maxCpu,
    setMinCpu,
    setMaxCpu,
    gpuLevelFilter,
    minGpu,
    maxGpu,
    setMinGpu,
    setMaxGpu,
    gpuOnly,
    setGpuOnly,
    sortKey,
    sortDir,
    currentPage,
    totalPages,
    setPage,
    paginated,
    filteredCount,
    counts,
    gpuCounts,
    activeFilterCount,
    toggleSort,
    toggleLevel,
    toggleGpuLevel,
    resetFilters,
  } = useProcessFilterState(processes);

  const { filterRootRef, filterDialogRef, filterButtonRef, searchRef } = useFilterBehavior(
    filterOpen,
    setFilterOpen,
  );

  if (status === "error" && processes.length === 0) {
    return (
      <ProcessesErrorScreen
        latest={latest}
        thermalLatest={thermalLatest}
        error={error}
        onRetry={retry}
      />
    );
  }

  if (status === "loading" && processes.length === 0) {
    return <ProcessesLoadingScreen latest={latest} thermalLatest={thermalLatest} />;
  }

  return (
    <Screen>
      <VitalsView latest={latest} thermalLatest={thermalLatest} />

      <Panel className="bg-transparent shadow-none">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <MagnifyingGlassIcon
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name"
              aria-label="Filter processes by name"
              aria-keyshortcuts="Control+F"
              className={cn(FIELD_CLASS, "pl-9 pr-16")}
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground"
            >
              Ctrl F
            </kbd>
          </div>

          <div className="relative" ref={filterRootRef}>
            <Button
              ref={filterButtonRef}
              variant="quiet"
              aria-expanded={filterOpen}
              aria-controls="process-filters"
              onClick={() => setFilterOpen((current) => !current)}
            >
              <SlidersHorizontalIcon size={14} aria-hidden="true" />
              Filter
              <FilterCount count={activeFilterCount} />
            </Button>

            <FilterDialogSlot
              open={filterOpen}
              levelFilter={levelFilter}
              onToggleLevel={toggleLevel}
              minCpu={minCpu}
              maxCpu={maxCpu}
              onMinCpu={setMinCpu}
              onMaxCpu={setMaxCpu}
              gpuLevelFilter={gpuLevelFilter}
              onToggleGpuLevel={toggleGpuLevel}
              minGpu={minGpu}
              maxGpu={maxGpu}
              onMinGpu={setMinGpu}
              onMaxGpu={setMaxGpu}
              gpuOnly={gpuOnly}
              onGpuOnly={setGpuOnly}
              counts={counts}
              gpuCounts={gpuCounts}
              activeCount={activeFilterCount}
              panelRef={filterDialogRef}
              onReset={resetFilters}
              onClose={() => {
                setFilterOpen(false);
                filterButtonRef.current?.focus();
              }}
            />
          </div>
        </div>

        <ProcessResults
          filteredCount={filteredCount}
          processCount={processes.length}
          rows={paginated}
          history={processHistory}
          systemMemoryTotal={systemMemoryTotal}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          onReset={resetFilters}
        />
      </Panel>
    </Screen>
  );
}
