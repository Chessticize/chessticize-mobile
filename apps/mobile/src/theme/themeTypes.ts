// A theme is a complete set of semantic tokens. Components read tokens through
// useTheme()/makeStyles and never hard-code hex or rgba values. A new palette
// (for example dark mode) only has to satisfy these types.

// Colors for one status family. Steps follow the tonal ladder the app already
// uses: lower numbers are light tints, higher numbers are dark text colors.
export type AccentColors = {
  s50: string;
  s100: string;
  s200: string;
  s300: string;
  s400: string;
  s500: string;
  s600: string;
  s700: string;
  s800: string;
  s900: string;
  wash: string;
  // Faint fill of a drop target and the tint of accent hints drawn on a dark scrim.
  dropZone: string;
  glassFill: string;
  glassBorder: string;
};

export type SuccessColors = {
  s50: string;
  s100: string;
  s200: string;
  s300: string;
  s700: string;
  s800: string;
};

// Green variant used by Review counts and a few positive badges.
export type PositiveColors = {
  s100: string;
  s600: string;
  s700: string;
  // Translucent fill flashed on a correct move.
  flash: string;
};

export type WarningColors = {
  s50: string;
  s100: string;
  s200: string;
  s300: string;
  s400: string;
  s500: string;
  s600: string;
  s700: string;
  s800: string;
  s900: string;
};

export type CautionColors = {
  s50: string;
  s100: string;
  s200: string;
  s700: string;
  s800: string;
  s900: string;
};

export type DangerColors = {
  s50: string;
  s100: string;
  s200: string;
  s300: string;
  s500: string;
  s600: string;
  s700: string;
  s800: string;
  // Translucent fill flashed on a wrong move.
  flash: string;
};

export type BoardColors = {
  lightSquare: string;
  darkSquare: string;
  promotionPieceButton: string;
  lastMoveHighlight: string;
  checkmateHighlight: string;
  validMoveDot: string;
  validMoveCapture: string;
  lastMoveSquare: string;
  // Promotion dialog surfaces (patched react-native-chessboard).
  promotionOverlay: string;
  promotionContainer: string;
  promotionBorder: string;
  promotionShadow: string;
  promotionPieceBorder: string;
};

export type ThemeColors = {
  // Surfaces, from the app canvas up to emphasized fills.
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceStrong: string;
  surfaceInverse: string;
  // Solid fills for tracks, dots and disabled controls, light to dark.
  fillMuted: string;
  fillStrong: string;
  // Translucent fills layered over tinted surfaces.
  glass: string;
  glassStrong: string;
  veil: string;
  halo: string;
  scrim: string;
  scrimSoft: string;
  scrimStrong: string;
  shadow: string;
  text: {
    primary: string;
    heading: string;
    strong: string;
    secondary: string;
    tertiary: string;
    faint: string;
    onAccent: string;
    // Darkest ink, used by headings that sit on the app canvas.
    ink: string;
    // Text drawn on the dark inverse surface.
    inverse: string;
  };
  border: {
    default: string;
    strong: string;
    heavy: string;
  };
  accent: AccentColors;
  success: SuccessColors;
  positive: PositiveColors;
  warning: WarningColors;
  caution: CautionColors;
  danger: DangerColors;
  // Hairlines drawn over tinted surfaces.
  hairline: {
    neutral: string;
    warning: string;
    warningStrong: string;
  };
  board: BoardColors;
  // Stage drawn while the predictive-back preview is shown.
  backGesture: {
    stage: string;
    eyebrow: string;
    label: string;
  };
};

export type ThemeSpace = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
  12: number;
  13: number;
  14: number;
  16: number;
  18: number;
  20: number;
  30: number;
};

export type ThemeRadius = {
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
  12: number;
  13: number;
  14: number;
  16: number;
  18: number;
  20: number;
  22: number;
  28: number;
  pill: number;
};

export type ThemeFontSize = {
  9: number;
  10: number;
  11: number;
  12: number;
  13: number;
  14: number;
  15: number;
  16: number;
  17: number;
  18: number;
  19: number;
  20: number;
  21: number;
  23: number;
  24: number;
  25: number;
  26: number;
  27: number;
  28: number;
  30: number;
  34: number;
  38: number;
  54: number;
};

export type ThemeFontWeight = {
  regular: "400";
  medium: "500";
  semibold: "600";
  bold: "700";
  heavy: "800";
  black: "900";
};

export type ThemeElevation = {
  // Small drop shadow used by slider thumbs and compact controls.
  low: {
    shadowColor: string;
    shadowOffset: { height: number; width: number };
    shadowOpacity: number;
    shadowRadius: number;
  };
  // CSS box shadows used by the web Lab.
  web: {
    raised: string;
    resting: string;
  };
};

export type Theme = {
  name: "light" | "dark";
  // Status bar icon style that stays legible over the theme's canvas.
  statusBarStyle: "dark-content" | "light-content";
  colors: ThemeColors;
  space: ThemeSpace;
  radius: ThemeRadius;
  fontSize: ThemeFontSize;
  fontWeight: ThemeFontWeight;
  fontFamily: { mono: string | undefined };
  elevation: ThemeElevation;
};
