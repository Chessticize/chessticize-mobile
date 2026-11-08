import {
  createElevation,
  fontFamily,
  fontSize,
  fontWeight,
  metrics,
  radius,
  shape,
  space,
  spacing,
  typography
} from "./scales.ts";
import type { Theme, ThemeColors } from "./themeTypes.ts";

// Light palette for visual direction A "Grouped Native" (#609), the light counterpart of
// darkTheme. The named roles come from docs/ui-design/MOBILE_UI_DESIGN.md: grouped
// background #F2F2F7 (surfaceRaised, the app canvas), white sections (surface), separator
// #D8D8DC, secondary text #636366, accent fill #0066D6 and accent text #0062CC, and the
// AA-safe positive #1F7A35, negative #C8102E and warning #9A5400 with their soft fills.
// Roles the direction does not define (tonal ramps, scrims) are derived in the same
// system-gray and system-blue family. Ramp steps keep their role: s50 is the faint tint,
// s900 the strongest text. Board, launch and back-gesture colors are unchanged here.
const colors: ThemeColors = {
  surface: "#FFFFFF",
  surfaceRaised: "#F2F2F7",
  surfaceSunken: "#F2F2F7",
  surfaceStrong: "#E5E5EA",
  surfaceInverse: "#1C1C1E",
  surfaceFloating: "#FFFFFF",
  thumb: "#FFFFFF",
  fillMuted: "#D1D1D6",
  fillStrong: "#8E8E93",
  fillDisabled: "#8E8E93",
  glass: "rgba(255, 255, 255, 0.66)",
  glassStrong: "rgba(249, 249, 251, 0.94)",
  veil: "rgba(242, 242, 247, 0.92)",
  scrim: "rgba(0, 0, 0, 0.45)",
  scrimSoft: "rgba(0, 0, 0, 0.38)",
  scrimStrong: "rgba(0, 0, 0, 0.85)",
  shadow: "#000000",
  text: {
    primary: "#000000",
    heading: "#1C1C1E",
    strong: "#3A3A3C",
    secondary: "#48484A",
    tertiary: "#636366",
    faint: "#616165",
    onAccent: "#FFFFFF",
    onTone: "#FFFFFF",
    ink: "#000000",
    inverse: "#F2F2F7"
  },
  border: {
    default: "#D8D8DC",
    strong: "#C7C7CC",
    heavy: "#8E8E93"
  },
  accent: {
    s50: "#F0F6FE",
    s100: "#E3EEFC",
    s200: "#C7DCF8",
    s300: "#9CC1F2",
    s400: "#4F94E8",
    s500: "#1F78DE",
    s600: "#0062CC",
    s700: "#0053AD",
    s800: "#00458F",
    s900: "#003873",
    wash: "#F7FAFE",
    fill: "#0066D6",
    dropZone: "rgba(0, 102, 214, 0.04)",
    glassFill: "rgba(227, 238, 252, 0.14)",
    glassBorder: "rgba(156, 193, 242, 0.48)"
  },
  success: {
    s50: "#EEF8F0",
    s100: "#E3F4E7",
    s200: "#BFE5C7",
    s300: "#8CD19A",
    s700: "#1A6B2E",
    s800: "#17602A"
  },
  positive: {
    s100: "#E3F4E7",
    s600: "#1B6F31",
    s700: "#1A6B2E",
    flash: "rgba(31, 122, 53, 0.30)"
  },
  warning: {
    s50: "#FEF8EE",
    s100: "#FDF0DE",
    s200: "#F8DDB0",
    s300: "#F2C27A",
    s400: "#E8A340",
    s500: "#A35A00",
    s600: "#9A5400",
    s700: "#8A4B00",
    s800: "#6E3C00",
    s900: "#5A3100"
  },
  caution: {
    s50: "#FFF4EA",
    s100: "#FFE8D4",
    s200: "#FFCFA3",
    s700: "#A04000",
    s800: "#8F3900",
    s900: "#702D00"
  },
  danger: {
    s50: "#FEF1F2",
    s100: "#FCE6E8",
    s200: "#F7C4CA",
    s300: "#EF97A1",
    s500: "#E0263C",
    s600: "#C8102E",
    s700: "#A80D26",
    s800: "#870A1F",
    flash: "rgba(200, 16, 46, 0.30)"
  },
  hairline: {
    neutral: "rgba(60, 60, 67, 0.18)",
    warning: "rgba(154, 84, 0, 0.25)",
    warningStrong: "rgba(154, 84, 0, 0.22)"
  },
  board: {
    lightSquare: "#E6E8EB",
    darkSquare: "#7B8794",
    promotionPieceButton: "#F8FAFC",
    lastMoveHighlight: "rgba(0, 0, 0, 0)",
    checkmateHighlight: "rgba(0, 0, 0, 0)",
    validMoveDot: "rgba(15, 23, 42, 0.36)",
    validMoveCapture: "rgba(15, 23, 42, 0.56)",
    lastMoveSquare: "rgba(37, 99, 235, 0.3)",
    promotionOverlay: "rgba(15, 23, 42, 0.38)",
    promotionContainer: "#F8FAFC",
    promotionBorder: "#D8E0E8",
    promotionShadow: "#000",
    promotionPieceBorder: "#CBD5E1",
    coordinateOnLightSquare: "#334155",
    coordinateOnDarkSquare: "#F8FAFC",
    coordinateHaloOnLightSquare: "rgba(248, 250, 252, 0.85)",
    coordinateHaloOnDarkSquare: "rgba(15, 23, 42, 0.55)"
  },
  launch: {
    background: "#F7F7F2",
    title: "#1D201F",
    detail: "#6B6258"
  },
  backGesture: {
    stage: "#DCE7F5",
    eyebrow: "#516078",
    label: "#172033"
  }
};

export const lightTheme: Theme = {
  name: "light",
  statusBarStyle: "dark-content",
  colors,
  typography,
  shape,
  spacing,
  metrics,
  space,
  radius,
  fontSize,
  fontWeight,
  fontFamily,
  elevation: createElevation(colors.shadow)
};
