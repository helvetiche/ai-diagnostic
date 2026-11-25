import type { LogsBitlockerVolume, LogsSnapshot } from "@/types/logs";
import type { ResourceSample } from "@/types/resources";
import type { ThermalSample } from "@/types/thermal";

type PreloadCache = {
  resourceSamples: ResourceSample[] | null;
  thermalSamples: ThermalSample[] | null;
  logsSnapshot: LogsSnapshot | null;
  logsBitlocker: LogsBitlockerVolume[] | null;
  setResourceSamples: (samples: ResourceSample[] | null) => void;
  setThermalSamples: (samples: ThermalSample[] | null) => void;
  setLogsSnapshot: (snapshot: LogsSnapshot | null) => void;
  setLogsBitlocker: (volumes: LogsBitlockerVolume[] | null) => void;
};

const cache: {
  resourceSamples: ResourceSample[] | null;
  thermalSamples: ThermalSample[] | null;
  logsSnapshot: LogsSnapshot | null;
  logsBitlocker: LogsBitlockerVolume[] | null;
} = {
  resourceSamples: null,
  thermalSamples: null,
  logsSnapshot: null,
  logsBitlocker: null,
};

export const preloadCache: PreloadCache = {
  get resourceSamples() {
    return cache.resourceSamples;
  },
  get thermalSamples() {
    return cache.thermalSamples;
  },
  get logsSnapshot() {
    return cache.logsSnapshot;
  },
  get logsBitlocker() {
    return cache.logsBitlocker;
  },
  setResourceSamples(samples) {
    cache.resourceSamples = samples;
  },
  setThermalSamples(samples) {
    cache.thermalSamples = samples;
  },
  setLogsSnapshot(snapshot) {
    cache.logsSnapshot = snapshot;
  },
  setLogsBitlocker(volumes) {
    cache.logsBitlocker = volumes;
  },
};
