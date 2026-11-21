export type LogsOsInfo = {
  caption: string | null;
  version: string | null;
  build: string | null;
  architecture: string | null;
  installDate: string | null;
  lastBoot: string | null;
  freePhysicalMemoryKb: number | null;
  totalVisibleMemoryKb: number | null;
  freeVirtualMemoryKb: number | null;
  serialNumber: string | null;
};

export type LogsMachineInfo = {
  manufacturer: string | null;
  model: string | null;
  totalPhysicalMemory: number | null;
  numberOfProcessors: number | null;
  numberOfLogicalProcessors: number | null;
  pcSystemType: number | null;
  serialNumber: string | null;
  chassisType: number | null;
  biosVersion: string | null;
  biosDate: string | null;
};

export type LogsActivation = {
  name: string | null;
  status: number | null;
};

export type LogsBattery = {
  name: string | null;
  chemistry: number | null;
  designCapacity: number | null;
  fullChargeCapacity: number | null;
  chargePercent: number | null;
  status: number | null;
  estimatedRunTime: number | null;
};

export type LogsStorage = {
  friendlyName: string | null;
  mediaType: number | null;
  busType: number | null;
  healthStatus: number | null;
  operationalStatus: string | null;
  sizeBytes: number | null;
  temperature: number | null;
  powerOnHours: number | null;
  wear: number | null;
  readErrorsTotal: number | null;
  readErrorsUncorrected: number | null;
  writeErrorsTotal: number | null;
  writeErrorsUncorrected: number | null;
  readLatencyMax: number | null;
  writeLatencyMax: number | null;
  smartPredictFailure: boolean | null;
  smartReason: number | null;
};

export type LogsDeviceProblem = {
  name: string | null;
  classGuid: string | null;
  deviceId: string | null;
  manufacturer: string | null;
  errorCode: number | null;
};

export type LogsFirewallProfile = {
  name: string | null;
  enabled: boolean | null;
};

export type LogsBitlockerVolume = {
  volume: string | null;
  protectionStatus: number | null;
  encryptionPercent: number | null;
  volumeStatus: number | null;
};

export type LogsSecurity = {
  defenderRealtime: boolean | null;
  defenderAntivirus: boolean | null;
  defenderAntispyware: boolean | null;
  defenderSignatureLastUpdated: string | null;
  defenderQuickScanAge: number | null;
  defenderFullScanAge: number | null;
  firewallProfiles: LogsFirewallProfile[];
  bitlocker: LogsBitlockerVolume[];
  secureBoot: boolean | null;
  tpmPresent: boolean | null;
  tpmReady: boolean | null;
  pendingReboot: boolean;
  uacEnabled: boolean | null;
};

export type LogsReliabilityRecord = {
  time: string | null;
  productName: string | null;
  message: string | null;
  eventIdentifier: number | null;
  sourceName: string | null;
};

export type LogsSoftware = {
  name: string | null;
  version: string | null;
  publisher: string | null;
  installDate: string | null;
};

export type LogsDriver = {
  deviceName: string | null;
  driverVersion: string | null;
  driverDate: string | null;
  signer: string | null;
  infName: string | null;
};

export type LogsSmartFailure = {
  instance: string | null;
  reason: number | null;
};

export type LogsEvent = {
  channel: string;
  provider: string;
  eventId: number;
  recordId: number;
  time: number | null;
  level: string;
  category: string;
  headline: string;
  detail: string | null;
};

export type LogsSnapshot = {
  capturedAt: number;
  os: LogsOsInfo | null;
  activation: LogsActivation | null;
  machine: LogsMachineInfo | null;
  battery: LogsBattery | null;
  storage: LogsStorage[];
  smartFailures: LogsSmartFailure[];
  deviceProblems: LogsDeviceProblem[];
  security: LogsSecurity | null;
  reliability: LogsReliabilityRecord[];
  software: LogsSoftware[];
  softwareCount: number;
  drivers: LogsDriver[];
  events: LogsEvent[];
  logError: string | null;
};