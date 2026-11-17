import { cn } from "@/lib/utils";

export type MeterTone =
  | "primary"
  | "success"
  | "warning"
  | "critical"
  | "neutral"
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "peak";

const SEGMENT_COUNT = 5;
const SEGMENT_SPAN = 100 / SEGMENT_COUNT;

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
};

export function Meter({
  value,
  max = 100,
  tone = "neutral",
  label,
  className,
}: {
  value: number | null;
  max?: number;
  tone?: MeterTone;
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const percent =
    value === null || !Number.isFinite(value)
      ? 0
      : Math.min(Math.max((value / safeMax) * 100, 0), 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={value === null || !Number.isFinite(value) ? undefined : Math.round(value)}
      className={cn("grid w-full grid-cols-5 gap-1", className)}
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
        const fill = Math.min(Math.max((percent - index * SEGMENT_SPAN) / SEGMENT_SPAN, 0), 1);

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
