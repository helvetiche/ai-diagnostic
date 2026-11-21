import { cn } from "@/lib/utils";

type MeterTone =
  | "primary"
  | "success"
  | "warning"
  | "critical"
  | "neutral"
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "peak"
  | "blue";

const SEGMENT_COUNT = 5;

const TONE_FILL: Record<MeterTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  neutral: "bg-muted-foreground",
  low: "bg-load-low",
  moderate: "bg-load-moderate",
  elevated: "bg-load-elevated",
  high: "bg-load-high",
  peak: "bg-load-peak",
  blue: "bg-blue-700 dark:bg-blue-300",
};

function Meter({
  value,
  max = 100,
  tone = "neutral",
  label,
  segments = SEGMENT_COUNT,
  className,
}: {
  value: number | null;
  max?: number;
  tone?: MeterTone;
  label: string;
  segments?: number;
  className?: string;
}) {
  const safeSegments = segments > 0 ? segments : SEGMENT_COUNT;
  const safeMax = max > 0 ? max : 100;
  const percent =
    value === null || !Number.isFinite(value)
      ? 0
      : Math.min(Math.max((value / safeMax) * 100, 0), 100);
  const segmentSpan = 100 / safeSegments;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={value === null || !Number.isFinite(value) ? undefined : Math.round(value)}
      className={cn("grid w-full gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${safeSegments}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: safeSegments }, (_, index) => {
        const fill = Math.min(Math.max((percent - index * segmentSpan) / segmentSpan, 0), 1);

        return (
          <div
            key={index}
            aria-hidden="true"
            className="h-1.5 overflow-hidden border border-border bg-surface-muted"
          >
            <div
              className={cn("h-full transition-[width] duration-500 ease-soft", TONE_FILL[tone])}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export { Meter };
export type { MeterTone };
