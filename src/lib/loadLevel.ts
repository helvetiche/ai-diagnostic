export type LoadLevel = {
  label: string;
  barClassName: string;
  badgeClassName: string;
};

export function loadLevel(percent: number): LoadLevel {
  if (percent >= 90) {
    return {
      label: "Saturated",
      barClassName: "bg-critical",
      badgeClassName: "bg-critical-soft text-critical",
    };
  }
  if (percent >= 70) {
    return {
      label: "High",
      barClassName: "bg-warning",
      badgeClassName: "bg-warning-soft text-warning",
    };
  }
  return {
    label: "Normal",
    barClassName: "bg-success",
    badgeClassName: "bg-success-soft text-success",
  };
}
