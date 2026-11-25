export {
  BOARD_THEME_OPTIONS,
  DEFAULT_DARK_BOARD_THEME,
  DEFAULT_LIGHT_BOARD_THEME,
  boardColorsFor,
  boardThemeOptionFor,
  themeWithBoardTheme
} from "./boardThemes.ts";
export type { BoardSchemePalette, BoardThemeOption } from "./boardThemes.ts";
export { darkTheme } from "./darkTheme.ts";
export { lightTheme } from "./lightTheme.ts";
export { makeStyles } from "./makeStyles.ts";
export {
  ThemeProvider,
  themeForAppearance,
  useAppearance,
  useBoardAppearance,
  useTheme
} from "./ThemeProvider.ts";
export type { BoardAppearanceControl } from "./ThemeProvider.ts";
export type {
  AppearancePreference,
  BoardColors,
  BoardThemeId,
  ChessPieceSetId,
  Theme,
  ThemeColors
} from "./themeTypes.ts";
