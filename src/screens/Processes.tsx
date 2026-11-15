import { useEffect, useMemo, useState } from "react";
import { CaretDownIcon, CaretUpIcon, CpuIcon, FastForwardIcon, GraphicsCardIcon, MemoryIcon, RewindIcon, RowsIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";

import { useProcesses } from "@/hooks/useProcesses";
import { useResourceStream } from "@/hooks/useResourceStream";
import { Sparkline } from "@/components/Sparkline";
import { formatBytes, formatPercent } from "@/lib/format";
import { LEVEL_COLORS, processLevel } from "@/lib/processLevel";

export function Processes() {
  const { processes, processHistory, status, error, retry } = useProcesses();
  const { samples } = useResourceStream();
  const latest = samples.at(-1) ?? null;
  const systemMemoryTotal = latest?.memoryTotal ?? 0;

  const cpuUsage = latest?.cpu ?? 0;
  const memoryUsage =
    latest && latest.memoryTotal > 0 ? (latest.memoryUsed / latest.memoryTotal) * 100 : 0;
  const gpuUsage = latest?.gpus[0]?.usage ?? 0;
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

  useEffect(() => {
    setPage(0);
  }, [query, levelFilter, minCpu, maxCpu, gpuLevelFilter, minGpu, maxGpu, gpuOnly, sortKey, sortDir]);

  useEffect(() => {
    if (!filterOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target?.closest("[data-filter-root]")) {
        setFilterOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [filterOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return processes.filter((process) => {
      if (q && !process.name.toLowerCase().includes(q)) {
        return false;
      }
      if (levelFilter.length > 0 && !levelFilter.includes(processLevel(process.cpu).label)) {
        return false;
      }
      if (process.cpu < minCpu || process.cpu > maxCpu) {
        return false;
      }
      if (gpuOnly && process.gpu === null) {
        return false;
      }
      if (process.gpu !== null) {
        if (gpuLevelFilter.length > 0 && !gpuLevelFilter.includes(processLevel(process.gpu).label)) {
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
  }, [processes, query, levelFilter, minCpu, maxCpu, gpuOnly, gpuLevelFilter, minGpu, maxGpu]);

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

  function toggleSort(key: "name" | "cpu" | "memory" | "gpu") {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
 

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            The process sampler did not start
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            Process data comes from the desktop app. Run it with{" "}
            <span className="font-mono">npm run tauri dev</span>.
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

  if (status === "loading" && processes.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
 

        <section className="bg-surface p-5">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
            Starting the process sampler
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            The first process list arrives in a few seconds.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 pb-8 pt-0">


      <section className="p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="glass-item flex size-10 shrink-0 items-center justify-center border border-primary text-primary">
              <RowsIcon size={22} weight="fill" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">
                Live Processes
              </h2>
              <p className="mt-1 font-mono text-[11px] leading-4 text-muted-foreground">
                Live process list sampled from this machine.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name"
              aria-label="Filter processes by name"
              className="min-h-10 flex-1 border border-border bg-surface-muted px-3 text-xs text-foreground shadow-soft placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="relative" data-filter-root>
              <button
                type="button"
                onClick={() => setFilterOpen((current) => !current)}
                aria-expanded={filterOpen}
                className="flex min-h-10 items-center gap-1.5 border border-border bg-surface-muted px-3 text-xs font-medium text-foreground shadow-soft transition-colors duration-[120ms] ease-soft hover:bg-accent"
              >
                <SlidersHorizontalIcon size={14} aria-hidden="true" />
                Filter
              </button>
              {activeFilterCount > 0 ? (
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center bg-primary text-[10px] font-medium text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
              <div
                className="absolute right-0 top-full z-20 mt-2 w-80 border border-border bg-surface-muted/50 p-4 shadow-float backdrop-blur-md transition-all duration-[180ms] ease-soft"
                style={{
                  opacity: filterOpen ? 1 : 0,
                  transform: filterOpen ? "translateY(0)" : "translateY(-4px)",
                  pointerEvents: filterOpen ? "auto" : "none",
                }}
              >
                <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  CPU level
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Low", "Moderate", "High", "Critical"].map((level) => {
                    const selected = levelFilter.includes(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() =>
                          setLevelFilter((current) =>
                            selected ? current.filter((item) => item !== level) : [...current, level],
                          )
                        }
                        className={
                          selected
                            ? "flex items-center gap-1.5 border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                            : "flex items-center gap-1.5 border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-foreground"
                        }
                      >
                        <span className="size-2 shrink-0" style={{ backgroundColor: LEVEL_COLORS[level] }} />
                        {level}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <label className="block text-xs text-foreground">
                    Min CPU %
                    <input
                      type="text"
                      inputMode="numeric"
                      value={minCpu}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setMinCpu(Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      className="mt-1 min-h-6 w-full border border-border bg-surface-muted px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="block text-xs text-foreground">
                    Max CPU %
                    <input
                      type="text"
                      inputMode="numeric"
                      value={maxCpu}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setMaxCpu(Number.isNaN(parsed) ? 100 : parsed);
                      }}
                      className="mt-1 min-h-6 w-full border border-border bg-surface-muted px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>

                <p className="mt-4 text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  GPU level
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Low", "Moderate", "High", "Critical"].map((level) => {
                    const selected = gpuLevelFilter.includes(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() =>
                          setGpuLevelFilter((current) =>
                            selected ? current.filter((item) => item !== level) : [...current, level],
                          )
                        }
                        className={
                          selected
                            ? "flex items-center gap-1.5 border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                            : "flex items-center gap-1.5 border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-foreground"
                        }
                      >
                        <span className="size-2 shrink-0" style={{ backgroundColor: LEVEL_COLORS[level] }} />
                        {level}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <label className="block text-xs text-foreground">
                    Min GPU %
                    <input
                      type="text"
                      inputMode="numeric"
                      value={minGpu}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setMinGpu(Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      className="mt-1 min-h-6 w-full border border-border bg-surface-muted px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="block text-xs text-foreground">
                    Max GPU %
                    <input
                      type="text"
                      inputMode="numeric"
                      value={maxGpu}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setMaxGpu(Number.isNaN(parsed) ? 100 : parsed);
                      }}
                      className="mt-1 min-h-6 w-full border border-border bg-surface-muted px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>

                <label className="mt-3 flex items-center gap-1.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={gpuOnly}
                    onChange={(event) => setGpuOnly(event.target.checked)}
                  />
                  Has GPU usage
                </label>

                <p className="mt-4 text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  Sort
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["name", "cpu", "memory", "gpu"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={
                        sortKey === key
                          ? "flex items-center gap-1.5 border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                          : "flex items-center gap-1.5 border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-foreground"
                      }
                    >
                      {key === "name" ? "Name" : key === "cpu" ? "CPU" : key === "memory" ? "Memory" : "GPU"}
                      {sortKey === key && (sortDir === "asc" ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLevelFilter([]);
                    setMinCpu(0);
                    setMaxCpu(100);
                    setGpuLevelFilter([]);
                    setMinGpu(0);
                    setMaxGpu(100);
                    setGpuOnly(false);
                    setQuery("");
                  }}
                  className="mt-4 min-h-8 w-full border border-border bg-surface-muted px-3 text-xs font-medium text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {[
            { label: "CPU", value: cpuUsage, icon: CpuIcon },
            { label: "Memory", value: memoryUsage, icon: MemoryIcon },
            { label: "GPU", value: gpuUsage, icon: GraphicsCardIcon },
          ].map((item) => {
            const Icon = item.icon;
            const color = processLevel(item.value).color;
            return (
              <div key={item.label} className="flex flex-col gap-1.5">
                <div className="h-2 w-full border border-border bg-surface-muted">
                  <div
                    className="h-full transition-[width] duration-300 ease-soft"
                    style={{ width: `${Math.min(item.value, 100)}%`, backgroundColor: color }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Icon size={12} aria-hidden="true" className="text-muted-foreground" />
                    {item.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {formatPercent(item.value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {sorted.length === 0 ? (
          <p className="mt-4 bg-surface-muted px-4 py-6 text-center text-xs text-muted-foreground">
            No process matches that name.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto border border-border shadow-soft">
            <table className="w-full table-fixed text-xs shadow-soft">
              <thead>
                <tr className="text-left text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium bg-surface-muted">
  <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1.5">
    <RowsIcon size={14} aria-hidden="true" /> Name
    {sortKey === "name" && (sortDir === "asc" ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
  </button>
</th>
                  <th className="w-36 py-2 pr-3 text-left font-medium bg-surface-muted">
  <button type="button" onClick={() => toggleSort("cpu")} className="flex items-center gap-1.5">
    <CpuIcon size={14} aria-hidden="true" /> CPU
    {sortKey === "cpu" && (sortDir === "asc" ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
  </button>
</th>
                  <th className="w-40 py-2 pr-3 text-left font-medium bg-surface-muted">
  <button type="button" onClick={() => toggleSort("memory")} className="flex items-center gap-1.5">
    <MemoryIcon size={14} aria-hidden="true" /> Memory
    {sortKey === "memory" && (sortDir === "asc" ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
  </button>
</th>
                  <th className="w-36 py-2 pr-3 text-left font-medium bg-surface-muted">
  <button type="button" onClick={() => toggleSort("gpu")} className="flex items-center gap-1.5">
    <GraphicsCardIcon size={14} aria-hidden="true" /> GPU
    {sortKey === "gpu" && (sortDir === "asc" ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
  </button>
</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((process) => {
                  const level = processLevel(process.cpu);
                  return (
                  <tr key={process.pid} className="align-middle backdrop-blur-[2px]" style={{ boxShadow: `inset 4px 0 0 ${level.color}`, backgroundImage: `linear-gradient(to right, ${level.color}20, transparent)` }}>
                    <td className="py-2 pl-3 pr-4">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="truncate text-foreground">{process.name}</span>
                        <span className="flex w-fit shrink-0 items-center gap-2">
                          <span
                            className="flex items-center gap-1.5 px-1.5 py-0.5 font-mono text-[10px] leading-4 tabular-nums"
                            style={{ backgroundColor: `${level.color}20`, color: level.color }}
                          >
                            <span aria-hidden="true" className="size-2 shrink-0" style={{ backgroundColor: level.color }} />
                            {process.pid}
                          </span>

                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex h-full items-start justify-start gap-2">
                        <Sparkline
                          values={(processHistory[process.pid] ?? []).map((point) => point.cpu)}
                          color="var(--chart-1)"
                          min={0}
                          max={100}
                        />
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono tabular-nums text-foreground">
                            {formatPercent(process.cpu)}
                          </span>
                          {(() => {
                            const level = processLevel(process.cpu);
                            return (
                              <span
                                className="px-1.5 py-0.5 text-[9px] leading-3 font-medium uppercase"
                                style={{ backgroundColor: `${level.color}20`, color: level.color }}
                              >
                                {level.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex h-full items-start justify-start gap-2">
                        <Sparkline
                          values={(processHistory[process.pid] ?? []).map((point) => point.memory)}
                          color="var(--chart-2)"
                        />
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono tabular-nums text-foreground">
                            {formatBytes(process.memory)}
                          </span>
                          {(() => {
                            const memoryPercent =
                              systemMemoryTotal > 0 ? (process.memory / systemMemoryTotal) * 100 : 0;
                            const level = processLevel(memoryPercent);
                            return (
                              <span
                                className="px-1.5 py-0.5 text-[9px] leading-3 font-medium uppercase"
                                style={{ backgroundColor: `${level.color}20`, color: level.color }}
                              >
                                {level.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex h-full items-start justify-start gap-2">
                        <Sparkline
                          values={(processHistory[process.pid] ?? []).map((point) =>
                            point.gpu === null ? 0 : point.gpu,
                          )}
                          color="var(--chart-3)"
                          min={0}
                          max={100}
                        />
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono tabular-nums text-foreground">
                            {process.gpu === null ? "000%" : formatPercent(process.gpu)}
                          </span>
                          {(() => {
                            const level = processLevel(process.gpu === null ? 0 : process.gpu);
                            return (
                              <span
                                className="px-1.5 py-0.5 text-[9px] leading-3 font-medium uppercase"
                                style={{ backgroundColor: `${level.color}20`, color: level.color }}
                              >
                                {level.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > 0 ? (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="flex min-h-8 items-center gap-1.5 border border-border bg-surface-muted px-3 text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent disabled:opacity-40"
              >
                <RewindIcon size={14} aria-hidden="true" />
                Prev
              </button>
              <span className="font-mono">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                className="flex min-h-8 items-center gap-1.5 border border-border bg-surface-muted px-3 text-foreground transition-colors duration-[120ms] ease-soft hover:bg-accent disabled:opacity-40"
              >
                Next
                <FastForwardIcon size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          </>
        )}
      </section>
    </div>
  );
}
