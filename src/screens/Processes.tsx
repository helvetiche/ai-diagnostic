import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDownIcon,
  CaretUpIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";

import { PageHeader, Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { StateView } from "@/components/primitives/StateView";
import { StatusMark } from "@/components/primitives/StatusMark";
import { Sparkline } from "@/components/Sparkline";
import { useProcesses } from "@/hooks/useProcesses";
import { useResourceStream } from "@/hooks/useResourceStream";
import { formatBytes, formatPercent } from "@/lib/format";
import { loadToneClass } from "@/lib/loadLevel";
import { cn } from "@/lib/utils";

type Band = "Low" | "Moderate" | "High" | "Critical";

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
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1 text-[10px] font-medium transition-colors duration-[120ms] ease-soft",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
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
          const parsed = Number(event.target.value);
          onChange(Number.isNaN(parsed) ? 0 : parsed);
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
              checked={selected.includes(band.id)}
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

function FilterPanel({
  id,
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
}: {
  id: string;
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
}) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Filter processes"
      className="pop-enter glass absolute top-full right-0 z-30 mt-2 max-h-[min(70vh,34rem)] w-[20rem] overflow-y-auto rounded-panel p-4"
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
    </div>
  );
}

export function Processes() {
  const { processes, processHistory, status, error, retry } = useProcesses();
  const { samples } = useResourceStream();
  const latest = samples.at(-1) ?? null;
  const systemMemoryTotal = latest?.memoryTotal ?? 0;

  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [minCpu, setMinCpu] = useState(0);
  const [maxCpu, setMaxCpu] = useState(100);
  const [gpuOnly, setGpuOnly] = useState(false);
  const [gpuLevelFilter, setGpuLevelFilter] = useState<string[]>([]);
  const [minGpu, setMinGpu] = useState(0);
  const [maxGpu, setMaxGpu] = useState(100);
  const [sortKey, setSortKey] = useState<"name" | "cpu" | "memory" | "gpu">("cpu");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

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
  }, [filterOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return processes.filter((process) => {
      if (q && !process.name.toLowerCase().includes(q)) {
        return false;
      }
      if (levelFilter.length > 0 && !levelFilter.includes(processBand(process.cpu))) {
        return false;
      }
      if (process.cpu < minCpu || process.cpu > maxCpu) {
        return false;
      }
      if (gpuOnly && process.gpu === null) {
        return false;
      }
      if (process.gpu !== null) {
        if (gpuLevelFilter.length > 0 && !gpuLevelFilter.includes(processBand(process.gpu))) {
          return false;
        }
        if (process.gpu < minGpu || process.gpu > maxGpu) {
          return false;
        }
      } else if (gpuLevelFilter.length > 0) {
        return false;
      }
      return true;
    });
  }, [
    processes,
    query,
    levelFilter,
    minCpu,
    maxCpu,
    gpuOnly,
    gpuLevelFilter,
    minGpu,
    maxGpu,
  ]);

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
    (query.trim() ? 1 : 0) +
    levelFilter.length +
    (minCpu > 0 ? 1 : 0) +
    (maxCpu < 100 ? 1 : 0) +
    gpuLevelFilter.length +
    (minGpu > 0 ? 1 : 0) +
    (maxGpu < 100 ? 1 : 0) +
    (gpuOnly ? 1 : 0);

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

  function toggleSort(key: "name" | "cpu" | "memory" | "gpu") {
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

  if (status === "error" && processes.length === 0) {
    return (
      <Screen>
        <PageHeader title="Processes">
          <StatusMark tone="critical">Unavailable</StatusMark>
        </PageHeader>
        <StateView
          title="Process sampler unavailable"
          code={error ?? "Unknown error"}
          action={
            <Button variant="primary" onClick={retry}>
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }

  if (status === "loading" && processes.length === 0) {
    return (
      <Screen>
        <PageHeader title="Processes">
          <StatusMark tone="muted">Starting</StatusMark>
        </PageHeader>
        <StateView title="Starting process sampler" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="Processes">
        <StatusMark tone="success">Live</StatusMark>
      </PageHeader>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter processes by name"
            className={cn(FIELD_CLASS, "min-w-[12rem] flex-1")}
          />

          <div className="relative" ref={filterRootRef}>
            <Button
              ref={filterButtonRef}
              variant="quiet"
              aria-expanded={filterOpen}
              aria-controls="process-filters"
              onClick={() => {
                setFilterOpen((current) => !current);
                window.setTimeout(() => filterPanelRef.current?.querySelector("input")?.focus(), 0);
              }}
            >
              <SlidersHorizontalIcon size={14} aria-hidden="true" />
              Filter
              {activeFilterCount > 0 ? (
                <span className="font-mono text-[10px] tabular-nums text-primary">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>

            {filterOpen ? (
              <div ref={filterPanelRef}>
                <FilterPanel
                  id="process-filters"
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
                  onReset={resetFilters}
                />
              </div>
            ) : null}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="border-t border-border-subtle px-4 py-10 text-center">
            <p className="text-[12px] text-muted-foreground">
              {processes.length === 0 ? "No processes reported." : "No process matches these filters."}
            </p>
            {processes.length > 0 ? (
              <Button variant="ghost" className="mt-2" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border-t border-border-subtle">
              <table className="w-full min-w-[38rem] table-fixed">
                <thead>
                  <tr className="text-muted-foreground">
                    <th scope="col" className="px-4 py-1 text-left">
                      <SortHeader
                        label="Process"
                        active={sortKey === "name"}
                        direction={sortDir}
                        onClick={() => toggleSort("name")}
                      />
                    </th>
                    <th scope="col" className="w-[13rem] px-3 py-1 text-right">
                      <div className="flex justify-end">
                        <SortHeader
                          label="CPU"
                          align="right"
                          active={sortKey === "cpu"}
                          direction={sortDir}
                          onClick={() => toggleSort("cpu")}
                        />
                      </div>
                    </th>
                    <th scope="col" className="w-[9rem] px-3 py-1 text-right">
                      <div className="flex justify-end">
                        <SortHeader
                          label="Memory"
                          align="right"
                          active={sortKey === "memory"}
                          direction={sortDir}
                          onClick={() => toggleSort("memory")}
                        />
                      </div>
                    </th>
                    <th scope="col" className="w-[6rem] px-4 py-1 text-right">
                      <div className="flex justify-end">
                        <SortHeader
                          label="GPU"
                          align="right"
                          active={sortKey === "gpu"}
                          direction={sortDir}
                          onClick={() => toggleSort("gpu")}
                        />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((process) => {
                    const history = processHistory[process.pid] ?? [];

                    return (
                      <tr
                        key={process.pid}
                        className="border-t border-border-subtle transition-colors duration-[120ms] ease-soft hover:bg-surface-muted"
                      >
                        <td className="px-4 py-2">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate text-[12px] text-foreground">
                              {process.name}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                              {process.pid}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-3">
                            <Sparkline
                              className="hidden md:inline-block"
                              values={history.map((point) => point.cpu)}
                              color="var(--chart-1)"
                              min={0}
                              max={100}
                            />
                            <span
                              className={cn(
                                "w-12 text-right font-mono text-[11px] tabular-nums",
                                loadToneClass(process.cpu),
                              )}
                            >
                              {formatPercent(process.cpu)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="font-mono text-[11px] tabular-nums text-foreground">
                            {formatBytes(process.memory)}
                          </span>
                          {systemMemoryTotal > 0 ? (
                            <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                              {formatPercent((process.memory / systemMemoryTotal) * 100)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="font-mono text-[11px] tabular-nums text-foreground">
                            {process.gpu === null ? "—" : formatPercent(process.gpu)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                {sorted.length === 1 ? "1 process" : `${sorted.length} processes`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  disabled={currentPage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Previous
                </Button>
                <span className="px-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </Screen>
  );
}
