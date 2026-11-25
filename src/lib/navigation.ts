import {
  ClockIcon,
  DevicesIcon,
  FileTextIcon,
  GaugeIcon,
  PowerIcon,
  RowsIcon,
  ShieldWarningIcon,
  SlidersIcon,
} from "@phosphor-icons/react";

export type ScreenId =
  "overview" | "power" | "processes" | "configure" | "logs" | "reliability" | "events" | "devices";

export type NavChild = {
  id: ScreenId;
  label: string;
  section?: string;
  icon?: typeof GaugeIcon;
};

export type NavItem = {
  id: ScreenId;
  label: string;
  icon: typeof GaugeIcon;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: GaugeIcon },
  { id: "power", label: "Power Logs", icon: PowerIcon },
  { id: "processes", label: "Processes", icon: RowsIcon },
  {
    id: "logs",
    label: "Logs",
    icon: FileTextIcon,
    children: [
      { id: "reliability", label: "Reliability records", icon: ShieldWarningIcon },
      { id: "events", label: "Event timeline", icon: ClockIcon },
      { id: "devices", label: "Device with problems", icon: DevicesIcon },
    ],
  },
  { id: "configure", label: "Configure", icon: SlidersIcon },
];
