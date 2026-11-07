import { createElevation, fontFamily, fontSize, fontWeight, radius, space } from "./scales.ts";
import type { Theme, ThemeColors } from "./themeTypes.ts";

// Dark palette for visual direction A "Grouped Native" (#609): Apple's system dark colors.
// The named roles come from the chosen direction (background #000000, surface #1C1C1E,
// raised #2C2C2E, separator #38383A, secondary text #AEAEB2, accent fill #0A6FE0 and accent
// text #4DA3FF, positive #4CD964, negative #FF6961, warning #FFB340 and their soft fills).
// Roles the direction does not define (tonal ramps, faint text, scrims, board squares) are
// derived in the same system-gray family. Ramp steps keep their role: s50 is the faint tint,
// s900 the strongest text. The light theme stays slate until direction A's light palette lands.
const colors: ThemeColors = {
  surface: "#1C1C1E",
  surfaceRaised: "#000000",
  surfaceSunken: "#262628",
  surfaceStrong: "#303032",
  surfaceInverse: "#E5E5EA",
  thumb: "#FFFFFF",
  fillMuted: "#48484A",
  fillStrong: "#6E6E73",
  glass: "rgba(28, 28, 30, 0.66)",
  glassStrong: "rgba(36, 36, 38, 0.9)",
  veil: "rgba(0, 0, 0, 0.92)",
  scrim: "rgba(0, 0, 0, 0.65)",
  scrimSoft: "rgba(0, 0, 0, 0.55)",
  scrimStrong: "rgba(0, 0, 0, 0.92)",
  shadow: "#000000",
  text: {
    primary: "#FFFFFF",
    heading: "#F2F2F7",
    strong: "#E5E5EA",
    secondary: "#D1D1D6",
    tertiary: "#AEAEB2",
    faint: "#A6A6AB",
    onAccent: "#FFFFFF",
    onTone: "#000000",
    ink: "#FFFFFF",
    inverse: "#1C1C1E"
  },
  border: {
    default: "#38383A",
    strong: "#48484A",
    heavy: "#6E6E73"
  },
  accent: {
    s50: "#0B2A4D",
    s100: "#103862",
    s200: "#16467A",
    s300: "#235F9E",
    s400: "#2F7FE0",
    s500: "#3E8EF0",
    s600: "#4DA3FF",
    s700: "#6AB4FF",
    s800: "#8AC4FF",
    s900: "#B2D8FF",
    wash: "#081E38",
    fill: "#0A6FE0",
    dropZone: "rgba(10, 111, 224, 0.08)",
    glassFill: "rgba(219, 234, 254, 0.14)",
    glassBorder: "rgba(147, 197, 253, 0.48)"
  },
  success: {
    s50: "#0E2616",
    s100: "#12331B",
    s200: "#1F5A31",
    s300: "#2F8A4B",
    s700: "#4CD964",
    s800: "#86E89A"
  },
  positive: {
    s100: "#12331B",
    s600: "#4CD964",
    s700: "#4CD964",
    flash: "rgba(76, 217, 100, 0.30)"
  },
  warning: {
    s50: "#2A1C06",
    s100: "#3A2709",
    s200: "#5C400E",
    s300: "#7C5712",
    s400: "#A87A1A",
    s500: "#FFB340",
    s600: "#FFB340",
    s700: "#FFB340",
    s800: "#FFC670",
    s900: "#FFD99B"
  },
  caution: {
    s50: "#2B190A",
    s100: "#3A230F",
    s200: "#6B3F17",
    s700: "#FF9F0A",
    s800: "#FFB866",
    s900: "#FFCF99"
  },
  danger: {
    s50: "#2B1010",
    s100: "#3D1414",
    s200: "#6A2424",
    s300: "#A03A38",
    s500: "#FF6961",
    s600: "#FF6961",
    s700: "#FF8A84",
    s800: "#FFB0AB",
    flash: "rgba(255, 105, 97, 0.32)"
  },
  hairline: {
    neutral: "rgba(235, 235, 245, 0.18)",
    warning: "rgba(255, 179, 64, 0.30)",
    warningStrong: "rgba(255, 179, 64, 0.25)"
  },
  board: {
    lightSquare: "#B0B0B5",
    darkSquare: "#747479",
    promotionPieceButton: "#D1D1D6",
    lastMoveHighlight: "rgba(0, 0, 0, 0)",
    checkmateHighlight: "rgba(0, 0, 0, 0)",
    validMoveDot: "rgba(0, 0, 0, 0.38)",
    validMoveCapture: "rgba(0, 0, 0, 0.58)",
    lastMoveSquare: "rgba(10, 111, 224, 0.20)",
    promotionOverlay: "rgba(0, 0, 0, 0.62)",
    promotionContainer: "#1C1C1E",
    promotionBorder: "#38383A",
    promotionShadow: "#000",
    promotionPieceBorder: "#48484A",
    coordinateOnLightSquare: "#000000",
    coordinateOnDarkSquare: "#FFFFFF",
    coordinateHaloOnLightSquare: "rgba(255, 255, 255, 0.35)",
    coordinateHaloOnDarkSquare: "rgba(0, 0, 0, 0.65)"
  },
  launch: {
    background: "#000000",
    title: "#FFFFFF",
    detail: "#AEAEB2"
  },
  backGesture: {
    stage: "#000000",
    eyebrow: "#AEAEB2",
    label: "#E5E5EA"
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
