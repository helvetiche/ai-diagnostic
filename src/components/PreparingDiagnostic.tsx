import type { PreloadTask } from "@/hooks/usePreload";

export function PreparingDiagnostic({
  tasks,
  progress,
}: {
  tasks: PreloadTask[];
  progress: number;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const runningTask = tasks.find((task) => task.status === "running");
  const statusLabel = runningTask
    ? runningTask.label
    : percent >= 100
      ? "Ready"
      : "Preparing";

  return (
    <div className="app-canvas min-h-screen pb-24">
      <div className="fixed inset-x-0 bottom-0 px-6 py-3">
        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{statusLabel}</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-surface-muted">
          <div
            className="h-full bg-primary transition-[width] duration-[500ms] ease-soft"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}