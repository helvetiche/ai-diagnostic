export type ThermalStatus = "cold" | "normal" | "hot" | "critical";

type ThermalDevice = "cpu" | "gpu";

/*
 * Bands lean on the common guidance: idle chips sit in the 30-45 C range,
 * normal load runs 40-70 C, and throttling risk starts around 85 C. GPUs run a
 * few degrees warmer than CPUs under load, so they get a wider normal band.
 */
export function thermalStatus(celsius: number | null, device: ThermalDevice): ThermalStatus | null {
  if (celsius === null || !Number.isFinite(celsius)) {
    return null;
  }

  const coldBelow = device === "cpu" ? 40 : 45;
  const hotFrom = device === "cpu" ? 65 : 70;

  if (celsius < coldBelow) {
    return "cold";
  }
  if (celsius < hotFrom) {
    return "normal";
  }
  if (celsius < 85) {
    return "hot";
  }
  return "critical";
}

const STATUS_CLASS: Record<ThermalStatus, string> = {
  cold: "text-info",
  normal: "text-muted-foreground",
  hot: "text-warning",
  critical: "text-critical",
};

export function thermalStatusClass(status: ThermalStatus | null): string {
  return status === null ? "text-muted-foreground" : STATUS_CLASS[status];
}
