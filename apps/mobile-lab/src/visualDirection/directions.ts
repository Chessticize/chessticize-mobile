// Issue #609: the chosen visual direction, A "Grouped Native". The owner chose it
// from three Lab prototypes; docs/ui-design/MOBILE_UI_DESIGN.md records these values.
// This Lab reference stays independent of the app theme so it can be compared with
// the production tokens while phase 2 applies the direction destination by destination.

export type Appearance = "light" | "dark";

export type TypeRole =
  | "largeTitle"
  | "title"
  | "headline"
  | "body"
  | "subheadline"
  | "footnote"
  | "caption"
  | "numeralXL"
  | "numeralL"
  | "numeralRow";

export type TypeStyle = {
  size: number;
  lineHeight: number;
  weight: "300" | "400" | "500" | "600" | "700";
  tabular?: boolean;
  tracking?: number;
};

export type ColorRoles = {
  /** Screen background behind everything. */
  background: string;
  /** Section, card or list surface. May be translucent (composited over background). */
  surface: string;
  /** Sheets, popovers and selected rows. */
  surfaceRaised: string;
  /** Hairline separators and quiet strokes. */
  separator: string;
  textPrimary: string;
  textSecondary: string;
  /** Primary action fill. */
  accent: string;
  /** Text and icons on the primary action fill. */
  onAccent: string;
  /** Accent used as text or icon on background and surface (links, selection). */
  accentText: string;
  /** Quiet tint behind selected rows, icon tiles and badges. */
  accentSoft: string;
  positive: string;
  negative: string;
  warning: string;
  positiveSoft: string;
  negativeSoft: string;
  warningSoft: string;
  /** Tab bar, navigation rail and floating chrome fill. */
  chrome: string;
  /** Stroke on floating chrome. */
  chromeStroke: string;
  /** Board frame stroke around the existing BoardPlaceholder. */
  boardFrame: string;
};

export type Elevation = {
  /** Shadow for cards/sections in light appearance; dark appearance relies on surface steps. */
  card: { opacity: number; radius: number; offsetY: number };
  /** Floating chrome such as the tab bar and session header. */
  floating: { opacity: number; radius: number; offsetY: number };
};

export type VisualDirection = {
  name: string;
  rationale: string;
  surfaceModel: string;
  motion: string;
  haptics: string;
  iconStroke: number;
  type: Record<TypeRole, TypeStyle>;
  radius: { control: number; card: number; sheet: number; badge: number };
  spacing: { screen: number; section: number; group: number; row: number; inline: number };
  rowMinHeight: number;
  elevation: Elevation;
  colors: Record<Appearance, ColorRoles>;
};

/** 4-pt spacing scale. */
export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40] as const;

export const MIN_TARGET = 44;

export const GROUPED_NATIVE: VisualDirection = {
  name: "Grouped Native",
  rationale:
    "Closest to stock iOS 26: inset grouped sections on a grouped background, HIG text styles, tinted icon tiles and a floating glass tab bar.",
  surfaceModel: "Grouped background, one level of white/elevated sections, hairline separators inside sections, no borders.",
  motion:
    "System springs only: push/pop and sheet transitions, disclosure rows expand with a 0.35 s spring, score numerals roll on change.",
  haptics:
    "Selection tick on segmented controls and run choice, light impact on Start, success/warning notification on Sprint result.",
  iconStroke: 2,
  type: {
    largeTitle: { size: 30, lineHeight: 36, weight: "700", tracking: 0.4 },
    title: { size: 20, lineHeight: 25, weight: "600" },
    headline: { size: 16, lineHeight: 21, weight: "600" },
    body: { size: 15, lineHeight: 20, weight: "400" },
    subheadline: { size: 14, lineHeight: 19, weight: "400" },
    footnote: { size: 12, lineHeight: 16, weight: "400" },
    caption: { size: 12, lineHeight: 16, weight: "400" },
    numeralXL: { size: 28, lineHeight: 34, weight: "600", tabular: true },
    numeralL: { size: 22, lineHeight: 28, weight: "600", tabular: true },
    numeralRow: { size: 15, lineHeight: 20, weight: "600", tabular: true }
  },
  radius: { control: 12, card: 20, sheet: 34, badge: 999 },
  spacing: { screen: 16, section: 32, group: 8, row: 12, inline: 8 },
  rowMinHeight: 52,
  elevation: {
    card: { opacity: 0, radius: 0, offsetY: 0 },
    floating: { opacity: 0.12, radius: 24, offsetY: 8 }
  },
  colors: {
    light: {
      background: "#F2F2F7",
      surface: "#FFFFFF",
      surfaceRaised: "#FFFFFF",
      separator: "#D8D8DC",
      textPrimary: "#000000",
      textSecondary: "#636366",
      accent: "#0066D6",
      onAccent: "#FFFFFF",
      accentText: "#0062CC",
      accentSoft: "#E3EEFC",
      positive: "#1F7A35",
      negative: "#C8102E",
      warning: "#9A5400",
      positiveSoft: "#E3F4E7",
      negativeSoft: "#FCE6E8",
      warningSoft: "#FDF0DE",
      chrome: "rgba(249, 249, 251, 0.9)",
      chromeStroke: "rgba(0, 0, 0, 0.08)",
      boardFrame: "rgba(0, 0, 0, 0.08)"
    },
    dark: {
      background: "#000000",
      surface: "#1C1C1E",
      surfaceRaised: "#2C2C2E",
      separator: "#38383A",
      textPrimary: "#FFFFFF",
      textSecondary: "#AEAEB2",
      accent: "#0A6FE0",
      onAccent: "#FFFFFF",
      accentText: "#4DA3FF",
      accentSoft: "#0B2A4D",
      positive: "#4CD964",
      negative: "#FF6961",
      warning: "#FFB340",
      positiveSoft: "#12331B",
      negativeSoft: "#3D1414",
      warningSoft: "#3A2709",
      chrome: "rgba(36, 36, 38, 0.9)",
      chromeStroke: "rgba(255, 255, 255, 0.12)",
      boardFrame: "rgba(255, 255, 255, 0.12)"
    }
  }
};

type Rgba = { r: number; g: number; b: number; a: number };

export function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1]!.split(",").map((part) => part.trim());
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`Unsupported color ${value}`);
}

/** Composite a possibly translucent color over an opaque backdrop. */
export function compositeOver(color: string, backdrop: string): Rgba {
  const top = parseColor(color);
  const base = parseColor(backdrop);
  return {
    r: top.r * top.a + base.r * (1 - top.a),
    g: top.g * top.a + base.g * (1 - top.a),
    b: top.b * top.a + base.b * (1 - top.a),
    a: 1
  };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export type ContrastCheck = {
  pair: string;
  ratio: number;
};

/**
 * Text pairs each direction must keep at WCAG AA (4.5:1) in both appearances.
 * Translucent surfaces and soft fills are composited over the screen background first.
 */
export function contrastChecks(colors: ColorRoles): ContrastCheck[] {
  const background = compositeOver(colors.background, "#FFFFFF");
  const backgroundHex = toHex(background);
  const surface = compositeOver(colors.surface, backgroundHex);
  const raised = compositeOver(colors.surfaceRaised, backgroundHex);
  const chrome = compositeOver(colors.chrome, backgroundHex);
  const textRoles = [
    "textPrimary",
    "textSecondary",
    "accentText",
    "positive",
    "negative",
    "warning"
  ] as const;
  const checks: ContrastCheck[] = [];
  for (const role of textRoles) {
    const foreground = parseColor(colors[role]);
    checks.push({ pair: `${role} on background`, ratio: contrastRatio(foreground, background) });
    checks.push({ pair: `${role} on surface`, ratio: contrastRatio(foreground, surface) });
    checks.push({ pair: `${role} on surfaceRaised`, ratio: contrastRatio(foreground, raised) });
  }
  checks.push({ pair: "textSecondary on chrome", ratio: contrastRatio(parseColor(colors.textSecondary), chrome) });
  checks.push({ pair: "accentText on chrome", ratio: contrastRatio(parseColor(colors.accentText), chrome) });
  checks.push({
    pair: "onAccent on accent",
    ratio: contrastRatio(parseColor(colors.onAccent), compositeOver(colors.accent, backgroundHex))
  });
  const surfaceHex = toHex(surface);
  for (const [text, fill] of [
    ["accentText", "accentSoft"],
    ["positive", "positiveSoft"],
    ["negative", "negativeSoft"],
    ["warning", "warningSoft"]
  ] as const) {
    checks.push({
      pair: `${text} on ${fill}`,
      ratio: contrastRatio(parseColor(colors[text]), compositeOver(colors[fill], surfaceHex))
    });
  }
  return checks;
}

function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}
