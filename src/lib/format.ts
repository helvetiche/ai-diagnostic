const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(epochMs: number | null): string {
  if (epochMs === null || !Number.isFinite(epochMs)) {
    return "Not recorded";
  }

  return DATE_TIME_FORMAT.format(new Date(epochMs));
}

export function formatBytes(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1);
  const scaled = value / 1024 ** exponent;
  const rounded = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(digits);

  return `${rounded} ${BYTE_UNITS[exponent]}`;
}

export function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().padStart(3, "0");

  return rounded < 0 ? `-${digits}%` : `${digits}%`;
}

export function formatCelsius(value: number, digits = 0): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return `${value.toFixed(digits)}°C`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatRelative(epochMs: number | null): string {
  if (epochMs === null || !Number.isFinite(epochMs)) {
    return "Unknown time";
  }

  const diff = Date.now() - epochMs;
  if (diff < 0) {
    const future = -diff;
    const minutes = Math.floor(future / 60_000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return `in ${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `in ${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  }

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`;
}
