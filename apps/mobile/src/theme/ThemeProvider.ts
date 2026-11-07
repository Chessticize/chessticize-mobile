import React, { createContext, useContext } from "react";
import { lightTheme } from "./lightTheme.ts";
import type { Theme } from "./themeTypes.ts";

// Defaults to the light theme so components render the same with or without a provider.
const ThemeContext = createContext<Theme>(lightTheme);

// Written without JSX so the domain-core typecheck (root tsconfig) can include this module.
export function ThemeProvider({
  children,
  theme = lightTheme
}: React.PropsWithChildren<{ theme?: Theme }>): React.JSX.Element {
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
