import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ACCENTS,
  applyTheme,
  readStoredTheme,
  resolveDark,
  storeTheme,
  systemPrefersDark,
  type AccentId,
  type ThemeMode,
  type ThemeSettings,
} from "./theme";

type ThemeContextValue = ThemeSettings & {
  dark: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(() => readStoredTheme());
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  const dark = resolveDark(settings.mode, systemDark);

  useEffect(() => {
    applyTheme(settings, dark);
    storeTheme(settings);
  }, [settings, dark]);

  const setMode = useCallback((mode: ThemeMode) => {
    setSettings((current) => ({ ...current, mode }));
  }, []);

  const setAccent = useCallback((accent: AccentId) => {
    if (!ACCENTS.some((item) => item.id === accent)) {
      return;
    }

    setSettings((current) => ({ ...current, accent }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ ...settings, dark, setMode, setAccent }),
    [settings, dark, setMode, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
