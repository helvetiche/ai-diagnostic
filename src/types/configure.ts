export type PowerPlan = {
  guid: string;
  name: string;
  active: boolean;
};

export type PowerTimeouts = {
  monitorAc: number;
  monitorDc: number;
  diskAc: number;
  diskDc: number;
  standbyAc: number;
  standbyDc: number;
  hibernateAc: number;
  hibernateDc: number;
};
