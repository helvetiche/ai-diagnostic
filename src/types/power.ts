export type PowerKind = "shutdown" | "restart" | "clean-stop" | "unexpected-stop" | "bugcheck";

export type PowerSeverity = "critical" | "warning" | "info";

export type PowerEvent = {
  eventId: number;
  provider: string;
  recordId: number;
  time: number | null;
  role: string;
};

export type PowerFact = {
  label: string;
  value: string;
};

export type PowerRecord = {
  id: string;
  kind: PowerKind;
  time: number | null;
  timeNote: string | null;
  headline: string;
  detail: string;
  severity: PowerSeverity;
  isStop: boolean;
  facts: PowerFact[];
  events: PowerEvent[];
};

export type PowerLogInfo = {
  recordCount: number;
  oldestRecord: number;
  newestRecord: number;
  fileBytes: number;
  full: boolean;
  oldestTime: number | null;
};

export type PowerSnapshot = {
  capturedAt: number;
  uptimeSeconds: number | null;
  activeSeconds: number | null;
  sleepSeconds: number | null;
  bootTime: number | null;
  fastStartup: boolean | null;
  log: PowerLogInfo | null;
  logError: string | null;
  truncated: boolean;
  shutdowns: PowerRecord[];
  restarts: PowerRecord[];
  powerOffs: PowerRecord[];
  unclassifiedStops: PowerRecord[];
};
