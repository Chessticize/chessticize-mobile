import { Platform } from "react-native";
import type {
  Theme,
  ThemeElevation,
  ThemeFontSize,
  ThemeFontWeight,
  ThemeMetrics,
  ThemeRadius,
  ThemeShape,
  ThemeSpace,
  ThemeSpacing,
  ThemeTypography
} from "./themeTypes.ts";

// Non-color scales shared by every palette.
//
// The semantic scales (typography, shape, spacing, metrics) record visual
// direction A "Grouped Native" from docs/ui-design/MOBILE_UI_DESIGN.md. New and
// migrated components use only these. Sizes are Dynamic Type points at the
// default Large size; React Native Text scales them with the user's text size.

export const typography: ThemeTypography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  numeral: { fontSize: 22, lineHeight: 28, fontWeight: "600", fontVariant: ["tabular-nums"] },
  numeralLarge: { fontSize: 34, lineHeight: 41, fontWeight: "600", fontVariant: ["tabular-nums"] }
};

export const shape: ThemeShape = {
  control: 12,
  card: 20,
  sheet: 34,
  tile: 8,
  capsule: 999
};

export const spacing: ThemeSpacing = {
  screen: 16,
  section: 32,
  group: 8,
  row: 12,
  inline: 8
};

export const metrics: ThemeMetrics = {
  rowMinHeight: 52,
  minTarget: 44,
  iconTile: 30
};

// Deprecated pixel-named scales. They remain only for SessionGuideOverlay and
// SessionMistakeIndicator, which in-flight session PRs own; migrate those two to
// the semantic scales above when they land, then delete these.

/** @deprecated Use `spacing`. */
export const space: ThemeSpace = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  30: 30
};

/** @deprecated Use `shape`. */
export const radius: ThemeRadius = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  22: 22,
  28: 28,
  pill: 999
};

/** @deprecated Use `typography`. */
export const fontSize: ThemeFontSize = {
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 18,
  19: 19,
  20: 20,
  21: 21,
  23: 23,
  24: 24,
  25: 25,
  26: 26,
  27: 27,
  28: 28,
  30: 30,
  34: 34,
  38: 38,
  54: 54
};

/** @deprecated Use `typography`. */
export const fontWeight: ThemeFontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
  black: "900"
};

export const fontFamily: Theme["fontFamily"] = {
  mono: Platform.select({
    android: "monospace",
    default: "monospace",
    ios: "Menlo"
  })
};

export function createElevation(shadowColor: string): ThemeElevation {
  return {
    low: {
      shadowColor,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 2
    },
    web: {
      raised: "0 12px 28px rgba(15, 23, 42, 0.20)",
      resting: "0 1px 3px rgba(15, 23, 42, 0.08)"
    }
  };
}
