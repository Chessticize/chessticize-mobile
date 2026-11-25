import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import {
  DEFAULT_DARK_BOARD_THEME,
  DEFAULT_LIGHT_BOARD_THEME,
  themeWithBoardTheme
} from "./boardThemes.ts";
import { darkTheme } from "./darkTheme.ts";
import { lightTheme } from "./lightTheme.ts";
import {
  createNativeSystemBarAppearanceClient,
  type SystemBarAppearanceClient
} from "../platform/systemBarAppearance.ts";
import type {
  AppearancePreference,
  BoardThemeId,
  ChessPieceSetId,
  Theme
} from "./themeTypes.ts";

// Defaults to the light theme so components render the same with or without a provider.
const ThemeContext = createContext<Theme>(lightTheme);

type AppearanceControl = {
  appearance: AppearancePreference;
  setAppearance: (appearance: AppearancePreference) => void;
};

export type BoardAppearanceControl = {
  lightBoardTheme: BoardThemeId;
  darkBoardTheme: BoardThemeId;
  pieceSet: ChessPieceSetId;
  setLightBoardTheme: (boardTheme: BoardThemeId) => void;
  setDarkBoardTheme: (boardTheme: BoardThemeId) => void;
  setPieceSet: (pieceSet: ChessPieceSetId) => void;
};

const AppearanceContext = createContext<AppearanceControl>({
  appearance: "system",
  setAppearance: () => undefined
});

const BoardAppearanceContext = createContext<BoardAppearanceControl>({
  lightBoardTheme: DEFAULT_LIGHT_BOARD_THEME,
  darkBoardTheme: DEFAULT_DARK_BOARD_THEME,
  pieceSet: "default",
  setLightBoardTheme: () => undefined,
  setDarkBoardTheme: () => undefined,
  setPieceSet: () => undefined
});

export function themeForAppearance(
  appearance: AppearancePreference,
  systemScheme: string | null | undefined,
  boardThemes?: {
    lightBoardTheme?: BoardThemeId;
    darkBoardTheme?: BoardThemeId;
  }
): Theme {
  const scheme = appearance === "system" ? systemScheme : appearance;
  const isDark = scheme === "dark";
  const baseTheme = isDark ? darkTheme : lightTheme;
  const boardThemeId = isDark
    ? (boardThemes?.darkBoardTheme ?? DEFAULT_DARK_BOARD_THEME)
    : (boardThemes?.lightBoardTheme ?? DEFAULT_LIGHT_BOARD_THEME);
  return themeWithBoardTheme(baseTheme, boardThemeId);
}

const nativeSystemBars = createNativeSystemBarAppearanceClient();

// Written without JSX so the domain-core typecheck (root tsconfig) can include this module.
// An explicit `theme` wins (Lab, tests); otherwise the theme follows the appearance
// preference, and "system" follows the OS appearance live. The app-level provider (no
// explicit `theme`) also reports its effective scheme to the system bars.
export function ThemeProvider({
  appearance,
  children,
  darkBoardTheme,
  lightBoardTheme,
  onAppearanceChange,
  onDarkBoardThemeChange,
  onLightBoardThemeChange,
  onPieceSetChange,
  pieceSet,
  systemBars = nativeSystemBars,
  theme
}: React.PropsWithChildren<{
  appearance?: AppearancePreference;
  darkBoardTheme?: BoardThemeId;
  lightBoardTheme?: BoardThemeId;
  onAppearanceChange?: (appearance: AppearancePreference) => void;
  onDarkBoardThemeChange?: (boardTheme: BoardThemeId) => void;
  onLightBoardThemeChange?: (boardTheme: BoardThemeId) => void;
  onPieceSetChange?: (pieceSet: ChessPieceSetId) => void;
  pieceSet?: ChessPieceSetId;
  systemBars?: SystemBarAppearanceClient | null;
  theme?: Theme;
}>): React.JSX.Element {
  const systemScheme = useColorScheme();
  const parentAppearance = useContext(AppearanceContext);
  const parentBoardAppearance = useContext(BoardAppearanceContext);
  const resolvedAppearance = appearance ?? parentAppearance.appearance;
  const resolvedLightBoardTheme = lightBoardTheme ?? parentBoardAppearance.lightBoardTheme;
  const resolvedDarkBoardTheme = darkBoardTheme ?? parentBoardAppearance.darkBoardTheme;
  const resolvedPieceSet = pieceSet ?? parentBoardAppearance.pieceSet;
  const baseTheme = theme ?? themeForAppearance(resolvedAppearance, systemScheme);
  const activeBoardThemeId = baseTheme.name === "dark"
    ? resolvedDarkBoardTheme
    : resolvedLightBoardTheme;
  const shouldApplyBoardTheme =
    theme === undefined || lightBoardTheme !== undefined || darkBoardTheme !== undefined;
  const resolved = shouldApplyBoardTheme
    ? themeWithBoardTheme(baseTheme, activeBoardThemeId)
    : baseTheme;
  const systemBarScheme = theme ? null : resolved.name;
  useEffect(() => {
    if (systemBarScheme) {
      systemBars?.setAppearance(systemBarScheme);
    }
  }, [systemBarScheme, systemBars]);
  const setAppearance = onAppearanceChange ?? parentAppearance.setAppearance;
  const setLightBoardTheme = onLightBoardThemeChange ?? parentBoardAppearance.setLightBoardTheme;
  const setDarkBoardTheme = onDarkBoardThemeChange ?? parentBoardAppearance.setDarkBoardTheme;
  const setPieceSet = onPieceSetChange ?? parentBoardAppearance.setPieceSet;
  const control = useMemo<AppearanceControl>(
    () => ({ appearance: resolvedAppearance, setAppearance }),
    [resolvedAppearance, setAppearance]
  );
  const boardControl = useMemo<BoardAppearanceControl>(
    () => ({
      lightBoardTheme: resolvedLightBoardTheme,
      darkBoardTheme: resolvedDarkBoardTheme,
      pieceSet: resolvedPieceSet,
      setLightBoardTheme,
      setDarkBoardTheme,
      setPieceSet
    }),
    [
      resolvedDarkBoardTheme,
      resolvedLightBoardTheme,
      resolvedPieceSet,
      setDarkBoardTheme,
      setLightBoardTheme,
      setPieceSet
    ]
  );

  return React.createElement(
    AppearanceContext.Provider,
    { value: control },
    React.createElement(
      BoardAppearanceContext.Provider,
      { value: boardControl },
      React.createElement(ThemeContext.Provider, { value: resolved }, children)
    )
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useAppearance(): AppearanceControl {
  return useContext(AppearanceContext);
}

export function useBoardAppearance(): BoardAppearanceControl {
  return useContext(BoardAppearanceContext);
}
