export type DiskSample = {
  name: string;
  mount: string;
  total: number;
  available: number;
  removable: boolean;
  kind: string;
};

export type GpuSample = {
  name: string;
  memoryTotal: number;
  usage: number | null;
};

export type TopProcess = {
  name: string;
  cpu: number;
  memory: number;
  gpu: number | null;
};

export type TopNetworkProcess = {
  name: string;
  rate: number;
};

export type ResourceSample = {
  sampledAt: number;
  cpu: number;
  cores: number[];
  cpuBrand: string;
  cpuFrequency: number;
  memoryUsed: number;
  memoryTotal: number;
  swapUsed: number;
  swapTotal: number;
  download: number;
  upload: number;
  networkInterfaces: string[];
  diskRead: number;
  diskWrite: number;
  disks: DiskSample[];
  gpus: GpuSample[];
  batteryPercent: number | null;
  batteryCharging: boolean;
  hasBattery: boolean;
  uptime: number;
  topCpu?: TopProcess[];
  topMemory?: TopProcess[];
  topGpu?: TopProcess[];
  topDownload?: TopNetworkProcess[];
  topUpload?: TopNetworkProcess[];
  networkAttribution?: boolean;
};
