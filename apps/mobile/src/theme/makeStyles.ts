import { StyleSheet } from "react-native";
import { useTheme } from "./ThemeProvider.ts";
import type { Theme } from "./themeTypes.ts";

// Module-scope replacement for StyleSheet.create: declare styles as a function
// of the theme, then call the returned hook inside components. Sheets are
// created once per theme object and reused across renders and components.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T
): () => T {
  const sheets = new WeakMap<Theme, T>();

  return function useStyles(): T {
    const theme = useTheme();
    let sheet = sheets.get(theme);
    if (sheet === undefined) {
      sheet = StyleSheet.create(factory(theme));
      sheets.set(theme, sheet);
    }
    return sheet;
  };
}
