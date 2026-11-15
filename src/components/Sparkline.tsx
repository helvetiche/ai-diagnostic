import { cn } from "@/lib/utils";

type SparklineProps = {
  values: number[];
  color?: string;
  width?: number;
  height?: number | string;
  min?: number;
  max?: number;
  className?: string;
};

const COORD_HEIGHT = 100;

export function Sparkline({
  values,
  color = "var(--primary)",
  width = 72,
  height = 32,
  min,
  max,
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block border border-border", className)}
        style={{ width, height, display: "inline-block" }}
      />
    );
  }

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi - lo || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = COORD_HEIGHT - ((value - lo) / range) * COORD_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <span
      className={cn("inline-block border border-border", className)}
      style={{ width, height, display: "inline-block" }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${COORD_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        role="presentation"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            strokeDasharray: 1000,
            strokeDashoffset: 1000,
            animation: "draw-line 0.8s ease-out forwards",
          }}
        />
      </svg>
    </span>
  );
}