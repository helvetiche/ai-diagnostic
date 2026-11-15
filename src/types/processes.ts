export type ProcessSample = {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  gpu: number | null;
};

export type ProcessListSample = {
  sampledAt: number;
  processes: ProcessSample[];
};
