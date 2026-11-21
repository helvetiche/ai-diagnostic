import { GaugeIcon, PowerIcon, RowsIcon, SlidersIcon } from "@phosphor-icons/react";

export type ScreenId = "overview" | "power" | "processes" | "configure";

export type NavItem = {
  id: ScreenId;
  label: string;
  icon: typeof GaugeIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: GaugeIcon },
  { id: "power", label: "Power", icon: PowerIcon },
  { id: "processes", label: "Processes", icon: RowsIcon },
  { id: "configure", label: "Configure", icon: SlidersIcon },
];
