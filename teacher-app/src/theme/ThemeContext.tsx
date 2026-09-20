import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkPalette, lightPalette, type AppColors } from "./palettes";
import {
  headerGradient as lightHeaderGradient,
  fabGradient as lightFabGradient,
  orangeButtonGradient as lightOrangeButtonGradient,
  submitGradient as lightSubmitGradient,
  idCardsHeaderGradient as lightIdCardsHeaderGradient,
} from "./colors";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "teacher_theme_mode";

type ThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  headerGradient: readonly [string, string, ...string[]];
  idCardsHeaderGradient: readonly [string, string, ...string[]];
  fabGradient: readonly [string, string, ...string[]];
  orangeButtonGradient: readonly [string, string, ...string[]];
  submitGradient: readonly [string, string, ...string[]];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (!cancelled && (saved === "light" || saved === "dark")) {
          setModeState(saved);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : "light");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === "dark";
    const colors = isDark ? darkPalette : lightPalette;
    return {
      mode,
      isDark,
      colors,
      setMode,
      toggleMode,
      headerGradient: isDark
        ? ([colors.headerOrangeStart, colors.headerOrangeMid] as const)
        : lightHeaderGradient,
      idCardsHeaderGradient: isDark
        ? ([colors.brandGreen, colors.brandGreenLight] as const)
        : lightIdCardsHeaderGradient,
      fabGradient: isDark
        ? ([colors.headerOrangeStart, colors.headerOrangeMid] as const)
        : lightFabGradient,
      orangeButtonGradient: isDark
        ? ([colors.headerOrangeStart, colors.primaryOrange] as const)
        : lightOrangeButtonGradient,
      submitGradient: isDark
        ? ([colors.primaryOrange, colors.submitGreen] as const)
        : lightSubmitGradient,
    };
  }, [mode, setMode, toggleMode]);

  if (!ready) {
    // Avoid blank flash — render with light theme until preference loads
    const bootstrap: ThemeContextValue = {
      mode: "light",
      isDark: false,
      colors: lightPalette as unknown as AppColors,
      setMode,
      toggleMode,
      headerGradient: lightHeaderGradient,
      idCardsHeaderGradient: lightIdCardsHeaderGradient,
      fabGradient: lightFabGradient,
      orangeButtonGradient: lightOrangeButtonGradient,
      submitGradient: lightSubmitGradient,
    };
    return (
      <ThemeContext.Provider value={bootstrap}>{children}</ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
