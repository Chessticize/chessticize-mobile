import { createElevation, fontFamily, fontSize, fontWeight, radius, space } from "./scales.ts";
import type { Theme, ThemeColors } from "./themeTypes.ts";

// The only place color literals live. Values reproduce the app's current
// light appearance exactly (Tailwind slate/blue based).
const colors: ThemeColors = {
  surface: "#FFFFFF",
  surfaceRaised: "#F8FAFC",
  surfaceSunken: "#F1F5F9",
  surfaceStrong: "#E2E8F0",
  surfaceInverse: "#0F172A",
  fillMuted: "#CBD5E1",
  fillStrong: "#94A3B8",
  glass: "rgba(255, 255, 255, 0.66)",
  scrim: "rgba(15, 23, 42, 0.55)",
  shadow: "#0F172A",
  text: {
    primary: "#0F172A",
    heading: "#1E293B",
    strong: "#334155",
    secondary: "#475569",
    tertiary: "#64748B",
    faint: "#94A3B8",
    onAccent: "#FFFFFF",
    inverse: "#E2E8F0"
  },
  border: {
    default: "#E2E8F0",
    strong: "#CBD5E1",
    heavy: "#94A3B8"
  },
  accent: {
    s50: "#EFF6FF",
    s100: "#DBEAFE",
    s200: "#BFDBFE",
    s300: "#93C5FD",
    s400: "#60A5FA",
    s500: "#3B82F6",
    s600: "#2563EB",
    s700: "#1D4ED8",
    s800: "#1E40AF",
    s900: "#1E3A8A",
    wash: "#F8FBFF"
  },
  success: {
    s50: "#ECFDF5",
    s100: "#D1FAE5",
    s200: "#A7F3D0",
    s700: "#047857",
    s800: "#065F46"
  },
  positive: {
    s100: "#DCFCE7",
    s700: "#15803D"
  },
  warning: {
    s50: "#FFFBEB",
    s100: "#FEF3C7",
    s200: "#FDE68A",
    s300: "#FCD34D",
    s500: "#F59E0B",
    s700: "#B45309",
    s800: "#92400E",
    s900: "#78350F"
  },
  caution: {
    s50: "#FFF7ED",
    s100: "#FFEDD5",
    s200: "#FED7AA",
    s700: "#C2410C",
    s800: "#9A3412",
    s900: "#7C2D12"
  },
  danger: {
    s50: "#FEF2F2",
    s100: "#FEE2E2",
    s200: "#FECACA",
    s300: "#FCA5A5",
    s600: "#DC2626",
    s700: "#B91C1C",
    s800: "#991B1B"
  },
  hairline: {
    neutral: "rgba(100, 116, 139, 0.22)",
    warning: "rgba(245, 158, 11, 0.28)",
    warningStrong: "rgba(180, 83, 9, 0.22)"
  },
  board: {
    lightSquare: "#E6E8EB",
    darkSquare: "#7B8794",
    promotionPieceButton: "#F8FAFC",
    lastMoveHighlight: "rgba(0, 0, 0, 0)",
    checkmateHighlight: "rgba(0, 0, 0, 0)",
    validMoveDot: "rgba(15, 23, 42, 0.36)",
    validMoveCapture: "rgba(15, 23, 42, 0.56)"
  }
};

export const lightTheme: Theme = {
  name: "light",
  colors,
  space,
  radius,
  fontSize,
  fontWeight,
  fontFamily,
  elevation: createElevation(colors.shadow)
};
