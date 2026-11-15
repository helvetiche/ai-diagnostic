export type SensorStatus = "live" | "fallback" | "unavailable";

export type ThermalReading = {
  label: string;
  celsius: number;
};

export type SensorInfo = {
  id: string;
  label: string;
  method: string;
  methodLabel: string;
  status: SensorStatus;
  detail: string;
};

export type CpuThermal = {
  name: string;
  vendor: string;
  package: ThermalReading | null;
  hottestCore: ThermalReading | null;
  cores: ThermalReading[];
  sensor: SensorInfo;
};

export type GpuThermal = {
  name: string;
  celsius: number | null;
  sensor: SensorInfo;
};

export type PawnIoStatus = {
  installed: boolean;
  version: string | null;
  module: string | null;
  detail: string;
};

export type ThermalSample = {
  sampledAt: number;
  cpu: CpuThermal;
  gpus: GpuThermal[];
  pawnio: PawnIoStatus;
};
