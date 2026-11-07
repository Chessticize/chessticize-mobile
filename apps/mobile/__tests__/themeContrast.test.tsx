/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { darkTheme, lightTheme } from "../src/theme";
import type { Theme } from "../src/theme";

// WCAG 2.x contrast over the token pairs the components actually use. Pairs are
// read from the makeStyles factories: a style that sets both `color` and
// `backgroundColor` is one pair; text without its own background is checked
// against every neutral surface it can sit on.

const COMPONENTS_DIR = path.join(__dirname, "../src/components");
const NEUTRAL_SURFACES = ["surface", "surfaceRaised", "surfaceSunken", "surfaceStrong", "surfaceFloating"];
// Text tokens that only appear on a specific kind of background.
const SPECIAL_BACKGROUNDS: Record<string, string[]> = {
  "text.onAccent": ["accent.fill"],
  "text.onTone": ["danger.s600", "positive.s600", "warning.s500", "text.tertiary", "surfaceInverse"],
  "text.inverse": ["surfaceInverse"],
  fillMuted: ["surfaceInverse"],
  "board.coordinateOnLightSquare": ["board.lightSquare"],
  "board.coordinateOnDarkSquare": ["board.darkSquare"]
};
const AA_TEXT = 4.5;
const AA_UI = 3;

// Light is a shipped look and stays pixel-identical, so its pre-existing pairs
// below AA are recorded here instead of changed. The list may only shrink; a new
// light pair under AA fails the test. Dark has no exceptions.
const KNOWN_LIGHT_BELOW_AA: ReadonlySet<string> = new Set([
  "accent.s600 on surfaceStrong",
  "board.coordinateOnDarkSquare on board.darkSquare",
  "caution.s700 on surfaceStrong",
  "danger.s600 on surfaceStrong",
  "danger.s600 on surfaceSunken",
  "positive.s600 on surface",
  "positive.s600 on surfaceRaised",
  "positive.s600 on surfaceFloating",
  "positive.s600 on surfaceStrong",
  "positive.s600 on surfaceSunken",
  "positive.s700 on surfaceStrong",
  "success.s700 on surfaceStrong",
  "text.faint on surface",
  "text.faint on surfaceFloating",
  "text.faint on surfaceRaised",
  "text.faint on surfaceStrong",
  "text.faint on surfaceSunken",
  "text.onTone on positive.s600",
  "text.onTone on warning.s500",
  "text.tertiary on surfaceStrong",
  "text.tertiary on surfaceSunken",
  "warning.s700 on surfaceStrong"
]);

function tokenValue(theme: Theme, tokenPath: string): string | undefined {
  let value: unknown = theme.colors;
  for (const part of tokenPath.split(".")) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  return typeof value === "string" ? value : undefined;
}

function parseHex(color: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return undefined;
  const hex = match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(theme: Theme, foreground: string, background: string): number | undefined {
  const fg = tokenValue(theme, foreground);
  const bg = tokenValue(theme, background);
  const fgRgb = fg ? parseHex(fg) : undefined;
  const bgRgb = bg ? parseHex(bg) : undefined;
  if (!fgRgb || !bgRgb) return undefined; // translucent tokens are checked by eye
  const [a, b] = [luminance(fgRgb), luminance(bgRgb)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// Splits `makeStyles((theme) => ({ name: { ... }, ... }))` into entry bodies.
function styleEntries(source: string): string[] {
  const start = source.indexOf("makeStyles((theme) => ({");
  if (start < 0) return [];
  const entries: string[] = [];
  let depth = 0;
  let entryStart = -1;
  for (let i = start + "makeStyles((theme) => (".length; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") {
      depth += 1;
      if (depth === 2) entryStart = i;
    } else if (char === "}") {
      if (depth === 2 && entryStart >= 0) entries.push(source.slice(entryStart, i + 1));
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return entries;
}

type Pair = { foreground: string; background: string };

function usedPairs(): Pair[] {
  const seen = new Map<string, Pair>();
  const add = (foreground: string, background: string): void => {
    seen.set(`${foreground} on ${background}`, { foreground, background });
  };
  for (const file of fs.readdirSync(COMPONENTS_DIR).filter((name) => name.endsWith(".tsx"))) {
    const source = fs.readFileSync(path.join(COMPONENTS_DIR, file), "utf8");
    for (const entry of styleEntries(source)) {
      const foreground = /\bcolor:\s*theme\.colors\.([\w.]+)/.exec(entry)?.[1];
      const background = /\bbackgroundColor:\s*theme\.colors\.([\w.]+)/.exec(entry)?.[1];
      if (foreground && background) {
        add(foreground, background);
      } else if (foreground) {
        for (const surface of SPECIAL_BACKGROUNDS[foreground] ?? NEUTRAL_SURFACES) {
          add(foreground, surface);
        }
      }
    }
  }
  // Labels on filled controls that style the fill and the label separately.
  for (const fill of SPECIAL_BACKGROUNDS["text.onAccent"]) add("text.onAccent", fill);
  return [...seen.values()];
}

function failures(theme: Theme, pairs: Pair[]): string[] {
  return pairs
    .filter(({ foreground, background }) => {
      const ratio = contrast(theme, foreground, background);
      return ratio !== undefined && ratio < AA_TEXT;
    })
    .map(({ foreground, background }) => `${foreground} on ${background}`)
    .sort();
}

describe("theme contrast", () => {
  const pairs = usedPairs();

  it("reads a meaningful set of token pairs from the components", () => {
    expect(pairs.length).toBeGreaterThan(60);
    expect(pairs).toContainEqual({ foreground: "text.primary", background: "surface" });
  });

  it("keeps every text pair used by components at WCAG AA in the dark theme", () => {
    expect(failures(darkTheme, pairs)).toEqual([]);
  });

  it("does not add light pairs below WCAG AA beyond the recorded pre-existing ones", () => {
    const unexpected = failures(lightTheme, pairs).filter((pair) => !KNOWN_LIGHT_BELOW_AA.has(pair));
    expect(unexpected).toEqual([]);
  });

  it("keeps the recorded light exceptions current", () => {
    const actual = new Set(failures(lightTheme, pairs));
    const stale = [...KNOWN_LIGHT_BELOW_AA].filter((pair) => !actual.has(pair));
    expect(stale).toEqual([]);
  });

  it("keeps essential UI boundaries and fills at 3:1 in the dark theme", () => {
    const essential: Pair[] = [
      { foreground: "border.heavy", background: "surface" },
      { foreground: "border.heavy", background: "surfaceRaised" },
      { foreground: "accent.s600", background: "surface" },
      { foreground: "accent.s600", background: "surfaceRaised" },
      { foreground: "danger.s600", background: "surface" },
      { foreground: "positive.s600", background: "surface" },
      { foreground: "warning.s600", background: "surface" },
      { foreground: "fillStrong", background: "surface" }
    ];
    const low = essential.filter(({ foreground, background }) => {
      const ratio = contrast(darkTheme, foreground, background);
      return ratio !== undefined && ratio < AA_UI;
    });
    expect(low).toEqual([]);
  });

  it("keeps board coordinates legible on both square colors in each theme", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const onLight = contrast(theme, "board.coordinateOnLightSquare", "board.lightSquare");
      const onDark = contrast(theme, "board.coordinateOnDarkSquare", "board.darkSquare");
      expect(onLight).toBeGreaterThanOrEqual(theme === darkTheme ? AA_TEXT : 3);
      expect(onDark).toBeGreaterThanOrEqual(theme === darkTheme ? AA_TEXT : 3);
    }
  });
});
