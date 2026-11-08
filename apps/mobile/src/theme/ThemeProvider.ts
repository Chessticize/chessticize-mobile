import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkTheme } from "./darkTheme.ts";
import { lightTheme } from "./lightTheme.ts";
import {
  createNativeSystemBarAppearanceClient,
  type SystemBarAppearanceClient
} from "../platform/systemBarAppearance.ts";
import type { AppearancePreference, Theme } from "./themeTypes.ts";

// Defaults to the light theme so components render the same with or without a provider.
const ThemeContext = createContext<Theme>(lightTheme);

type AppearanceControl = {
  appearance: AppearancePreference;
  setAppearance: (appearance: AppearancePreference) => void;
};

const AppearanceContext = createContext<AppearanceControl>({
  appearance: "system",
  setAppearance: () => undefined
});

export function themeForAppearance(
  appearance: AppearancePreference,
  systemScheme: string | null | undefined
): Theme {
  const scheme = appearance === "system" ? systemScheme : appearance;
  return scheme === "dark" ? darkTheme : lightTheme;
}

const nativeSystemBars = createNativeSystemBarAppearanceClient();

// Written without JSX so the domain-core typecheck (root tsconfig) can include this module.
// An explicit `theme` wins (Lab, tests); otherwise the theme follows the appearance
// preference, and "system" follows the OS appearance live. The app-level provider (no
// explicit `theme`) also reports its effective scheme to the system bars.
export function ThemeProvider({
  appearance = "system",
  children,
  onAppearanceChange,
  systemBars = nativeSystemBars,
  theme
}: React.PropsWithChildren<{
  appearance?: AppearancePreference;
  onAppearanceChange?: (appearance: AppearancePreference) => void;
  systemBars?: SystemBarAppearanceClient | null;
  theme?: Theme;
}>): React.JSX.Element {
  const systemScheme = useColorScheme();
  const resolved = theme ?? themeForAppearance(appearance, systemScheme);
  const systemBarScheme = theme ? null : resolved.name;
  useEffect(() => {
    if (systemBarScheme) {
      systemBars?.setAppearance(systemBarScheme);
    }
  }, [systemBarScheme, systemBars]);
  const control = useMemo<AppearanceControl>(
    () => ({ appearance, setAppearance: onAppearanceChange ?? (() => undefined) }),
    [appearance, onAppearanceChange]
  );

  return React.createElement(
    AppearanceContext.Provider,
    { value: control },
    React.createElement(ThemeContext.Provider, { value: resolved }, children)
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useAppearance(): AppearanceControl {
  return useContext(AppearanceContext);
}
