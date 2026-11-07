import { Platform } from "react-native";
import type {
  Theme,
  ThemeElevation,
  ThemeFontSize,
  ThemeFontWeight,
  ThemeRadius,
  ThemeSpace
} from "./themeTypes.ts";

// Non-color scales shared by every palette. Keys are the pixel values the app
// uses today; a later design pass can consolidate them without touching callers.

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
