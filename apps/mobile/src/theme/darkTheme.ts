import { createElevation, fontFamily, fontSize, fontWeight, radius, space } from "./scales.ts";
import type { Theme, ThemeColors } from "./themeTypes.ts";

// Provisional dark palette in the same slate/blue family as the light theme.
// Ramp steps keep their role (s50 is the faint tint, s900 the strongest text),
// so a ramp is mirrored: tints become deep surfaces and text steps become light.
// Accent and tone fills (s500/s600) are bright so the dark on-accent text stays
// legible and the same value also reads as text and border on dark surfaces.
// Only these values should change when the visual direction (#609) is decided.
const colors: ThemeColors = {
  surface: "#0F172A",
  surfaceRaised: "#0B1120",
  surfaceSunken: "#172033",
  surfaceStrong: "#1E293B",
  surfaceInverse: "#E2E8F0",
  fillMuted: "#334155",
  fillStrong: "#64748B",
  glass: "rgba(15, 23, 42, 0.66)",
  glassStrong: "rgba(15, 23, 42, 0.94)",
  veil: "rgba(11, 17, 32, 0.92)",
  scrim: "rgba(2, 6, 23, 0.65)",
  scrimSoft: "rgba(2, 6, 23, 0.55)",
  scrimStrong: "rgba(2, 6, 23, 0.92)",
  shadow: "#000000",
  text: {
    primary: "#F8FAFC",
    heading: "#F1F5F9",
    strong: "#E2E8F0",
    secondary: "#CBD5E1",
    tertiary: "#A3B1C6",
    faint: "#8795AB",
    onAccent: "#0B1120",
    ink: "#F8FAFC",
    inverse: "#0F172A"
  },
  border: {
    default: "#1E293B",
    strong: "#334155",
    heavy: "#64748B"
  },
  accent: {
    s50: "#101E3A",
    s100: "#172B52",
    s200: "#1E3A6D",
    s300: "#2F5CA8",
    s400: "#4C8DEB",
    s500: "#6AA8FB",
    s600: "#60A5FA",
    s700: "#93C5FD",
    s800: "#A9CDFE",
    s900: "#BFDBFE",
    wash: "#0E1A30",
    dropZone: "rgba(96, 165, 250, 0.06)",
    glassFill: "rgba(219, 234, 254, 0.14)",
    glassBorder: "rgba(147, 197, 253, 0.48)"
  },
  success: {
    s50: "#0B2A22",
    s100: "#0F3B2F",
    s200: "#166A50",
    s300: "#2F9E7C",
    s700: "#34D399",
    s800: "#6EE7B7"
  },
  positive: {
    s100: "#0F3B24",
    s600: "#4ADE80",
    s700: "#4ADE80",
    flash: "rgba(74, 222, 128, 0.30)"
  },
  warning: {
    s50: "#2B2008",
    s100: "#3A2A08",
    s200: "#5C4310",
    s300: "#7A5A12",
    s400: "#A67B12",
    s500: "#F59E0B",
    s600: "#FBBF24",
    s700: "#FBBF24",
    s800: "#FCD34D",
    s900: "#FDE68A"
  },
  caution: {
    s50: "#2A1608",
    s100: "#3A200C",
    s200: "#6B3A12",
    s700: "#FB923C",
    s800: "#FDBA74",
    s900: "#FED7AA"
  },
  danger: {
    s50: "#2D1215",
    s100: "#3F1A1E",
    s200: "#6E2A2F",
    s300: "#A04048",
    s500: "#F87171",
    s600: "#F87171",
    s700: "#FCA5A5",
    s800: "#FECACA",
    flash: "rgba(248, 113, 113, 0.32)"
  },
  hairline: {
    neutral: "rgba(148, 163, 184, 0.25)",
    warning: "rgba(251, 191, 36, 0.30)",
    warningStrong: "rgba(251, 191, 36, 0.25)"
  },
  board: {
    lightSquare: "#9CA8B8",
    darkSquare: "#5A667A",
    promotionPieceButton: "#CBD5E1",
    lastMoveHighlight: "rgba(0, 0, 0, 0)",
    checkmateHighlight: "rgba(0, 0, 0, 0)",
    validMoveDot: "rgba(248, 250, 252, 0.45)",
    validMoveCapture: "rgba(248, 250, 252, 0.65)",
    lastMoveSquare: "rgba(96, 165, 250, 0.40)",
    promotionOverlay: "rgba(2, 6, 23, 0.62)",
    promotionContainer: "#0F172A",
    promotionBorder: "#334155",
    promotionShadow: "#000",
    promotionPieceBorder: "#475569",
    coordinateOnLightSquare: "#0F172A",
    coordinateOnDarkSquare: "#F8FAFC",
    coordinateHaloOnLightSquare: "rgba(248, 250, 252, 0.35)",
    coordinateHaloOnDarkSquare: "rgba(2, 6, 23, 0.65)"
  },
  launch: {
    background: "#0B1120",
    title: "#F1F5F9",
    detail: "#A3B1C6"
  },
  backGesture: {
    stage: "#0B1120",
    eyebrow: "#A3B1C6",
    label: "#E2E8F0"
  }
};

export const darkTheme: Theme = {
  name: "dark",
  statusBarStyle: "light-content",
  colors,
  space,
  radius,
  fontSize,
  fontWeight,
  fontFamily,
  elevation: createElevation(colors.shadow)
};
