import type { Theme } from "../../mobile/src/theme/themeTypes.ts";

// React Native Web does not apply the user's text size, so the Lab previews large
// text by scaling the theme's type sizes, the way Dynamic Type scales the same
// points on a device. A story opts in with the `labTextScale` parameter.

const scaledThemes = new WeakMap<Theme, Map<number, Theme>>();

/** The theme with every type size and line height multiplied by `scale`. Stable per theme and scale. */
export function themeWithTextScale(theme: Theme, scale: number): Theme {
  if (scale === 1) {
    return theme;
  }
  let byScale = scaledThemes.get(theme);
  if (byScale === undefined) {
    byScale = new Map();
    scaledThemes.set(theme, byScale);
  }
  let scaled = byScale.get(scale);
  if (scaled === undefined) {
    scaled = {
      ...theme,
      typography: Object.fromEntries(
        Object.entries(theme.typography).map(([role, style]) => [
          role,
          {
            ...style,
            fontSize: Math.round(style.fontSize * scale),
            lineHeight: Math.round(style.lineHeight * scale)
          }
        ])
      ) as Theme["typography"],
      fontSize: Object.fromEntries(
        Object.entries(theme.fontSize).map(([step, size]) => [step, Math.round(size * scale)])
      ) as unknown as Theme["fontSize"]
    };
    byScale.set(scale, scaled);
  }
  return scaled;
}
