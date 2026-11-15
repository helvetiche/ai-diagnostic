export const LEVEL_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#6b7280",
  High: "#ea580c",
  Extensive: "#dc2626",
  Critical: "#9333ea",
};

export type ProcessLevel = {
  label: string;
  color: string;
};

export function processLevel(cpu: number): ProcessLevel {
  if (cpu >= 80) {
    return { label: "Critical", color: "#9333ea" };
  }
  if (cpu >= 60) {
    return { label: "Critical", color: "#dc2626" };
  }
  if (cpu >= 40) {
    return { label: "High", color: "#ea580c" };
  }
  if (cpu >= 20) {
    return { label: "Moderate", color: "#6b7280" };
  }
  return { label: "Low", color: "#22c55e" };
}
