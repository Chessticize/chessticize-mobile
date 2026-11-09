import React, { useMemo } from "react";
import { PracticeViewportProvider, usePracticeViewport } from "../../mobile/src/components/PracticeViewport.tsx";
import { ThemeProvider, useTheme } from "../../mobile/src/theme/index.ts";
import { TYPE_ROLE_MAX_FONT_SCALE } from "../../mobile/src/theme/scales.ts";
import type { Theme } from "../../mobile/src/theme/index.ts";

// React Native scales text by the system font scale; the browser cannot, so the
// Lab simulates a Dynamic Type size. It scales the theme's type roles (the
// `display` hero score caps at 1.5x, as maxFontSizeMultiplier does on device)
// and reports the scale through the practice viewport, which layouts read.
// The browser has no adjustsFontSizeToFit, so text that shrinks to fit on
// device can show an ellipsis here.
// Text drawn with literal sizes rather than theme roles is not scaled here;
// native screenshots remain the acceptance evidence for those.

// React Native's iOS multiplier at the largest accessibility size (AX5).
export const LARGEST_ACCESSIBILITY_FONT_SCALE = 3.571;
// React Native's iOS multiplier at Accessibility Large (AX3).
export const ACCESSIBILITY_LARGE_FONT_SCALE = 2.353;
// Mirrors maxFontSizeMultiplier on device: the hero score caps at 1.5x and
// numerals (HUD values, stat values) at 2x; large titles, titles and
// headlines follow the shared caps that keep the heading hierarchy.
const CAPPED_ROLES: Record<string, number> = {
  ...TYPE_ROLE_MAX_FONT_SCALE,
  display: 1.5,
  numeral: 2,
  numeralRow: 2
};

function scaledTheme(theme: Theme, fontScale: number): Theme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, style]) => {
      const cap = CAPPED_ROLES[role];
      const scale = cap === undefined ? fontScale : Math.min(fontScale, cap);
      return [role, { ...style, fontSize: style.fontSize * scale, lineHeight: style.lineHeight * scale }];
    })
  ) as Theme["typography"];
  return { ...theme, typography };
}

export function LabTextSize({
  children,
  fontScale
}: React.PropsWithChildren<{ fontScale: number }>): React.JSX.Element {
  const theme = useTheme();
  const viewport = usePracticeViewport();
  const scaled = useMemo(() => scaledTheme(theme, fontScale), [theme, fontScale]);
  return (
    <PracticeViewportProvider value={{ fontScale, height: viewport.height, width: viewport.width }}>
      <ThemeProvider theme={scaled}>{children}</ThemeProvider>
    </PracticeViewportProvider>
  );
}
