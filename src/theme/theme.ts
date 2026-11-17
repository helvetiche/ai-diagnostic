export type ThemeMode = "light" | "dark" | "system";

export type AccentId = "steel" | "jade" | "clay" | "plum";

export type ThemeSettings = {
  mode: ThemeMode;
  accent: AccentId;
};

export const THEME_STORAGE_KEY = "windog.theme";

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export const ACCENTS: {
  id: AccentId;
  label: string;
  swatch: { light: string; dark: string };
}[] = [
  { id: "steel", label: "Steel", swatch: { light: "#3f6284", dark: "#9dbdd8" } },
  { id: "jade", label: "Jade", swatch: { light: "#2f6a52", dark: "#8fc9ab" } },
  { id: "clay", label: "Clay", swatch: { light: "#8a4f36", dark: "#d9a184" } },
  { id: "plum", label: "Plum", swatch: { light: "#6a4d75", dark: "#c3a8cf" } },
];

const MODE_IDS = new Set<string>(THEME_MODES.map((item) => item.id));
const ACCENT_IDS = new Set<string>(ACCENTS.map((item) => item.id));

export const DEFAULT_THEME: ThemeSettings = { mode: "system", accent: "steel" };

export function readStoredTheme(): ThemeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_THEME;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_THEME;
    }

    const candidate = parsed as Partial<ThemeSettings>;

    return {
      mode: MODE_IDS.has(candidate.mode ?? "") ? (candidate.mode as ThemeMode) : DEFAULT_THEME.mode,
      accent: ACCENT_IDS.has(candidate.accent ?? "")
        ? (candidate.accent as AccentId)
        : DEFAULT_THEME.accent,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(settings: ThemeSettings): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a locked-down webview. The theme still applies for this session.
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  if (mode === "system") {
    return systemDark;
  }

  return mode === "dark";
}

export function applyTheme(settings: ThemeSettings, dark: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.accent = settings.accent;
}
