type LoadTone = "low" | "moderate" | "elevated" | "high" | "peak";

function loadTone(percent: number): LoadTone {
  if (!Number.isFinite(percent) || percent < 20) {
    return "low";
  }
  if (percent < 40) {
    return "moderate";
  }
  if (percent < 60) {
    return "elevated";
  }
  if (percent < 80) {
    return "high";
  }
  return "peak";
}

const TONE_CLASS: Record<LoadTone, string> = {
  low: "text-load-low",
  moderate: "text-load-moderate",
  elevated: "text-load-elevated",
  high: "text-load-high",
  peak: "text-load-peak",
};

function loadToneClass(percent: number): string {
  return TONE_CLASS[loadTone(percent)];
}

/*
 * Four-word status for the vitals header. The five-color meter keeps the finer
 * gradient; the label groups it into buckets a person can read at a glance.
 */
type LoadStatus = "low" | "normal" | "intensive" | "critical";

function loadStatus(percent: number | null): LoadStatus | null {
  if (percent === null || !Number.isFinite(percent)) {
    return null;
  }
  if (percent < 20) {
    return "low";
  }
  if (percent < 60) {
    return "normal";
  }
  if (percent < 80) {
    return "intensive";
  }
  return "critical";
}

const STATUS_CLASS: Record<LoadStatus, string> = {
  low: "text-load-low",
  normal: "text-muted-foreground",
  intensive: "text-load-high",
  critical: "text-load-peak",
};

function loadStatusClass(status: LoadStatus | null): string {
  return status === null ? "text-muted-foreground" : STATUS_CLASS[status];
}

/*
 * Network has no utilization figure, only throughput. These bands describe
 * activity on a typical link, not link saturation: quiet, everyday traffic,
 * heavy transfer, and a saturated gigabit connection.
 */
function networkStatus(bytesPerSecond: number): LoadStatus {
  const megabytes = Math.max(bytesPerSecond, 0) / (1024 * 1024);

  if (megabytes < 1) {
    return "low";
  }
  if (megabytes < 10) {
    return "normal";
  }
  if (megabytes < 50) {
    return "intensive";
  }
  return "critical";
}

export { loadTone, loadToneClass, loadStatus, loadStatusClass, networkStatus };
export type { LoadTone, LoadStatus };
