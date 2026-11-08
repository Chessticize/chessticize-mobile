import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "../../mobile/src/theme/themeTypes.ts";
import { themeWithTextScale } from "./labTextScale.ts";

// The real themes import React Native, which Node cannot load; the scaling only reads
// the type scales, so a theme with those parts is enough.
function themeStub(name: "light" | "dark"): Theme {
  return {
    name,
    colors: { surface: name === "light" ? "#FFFFFF" : "#1C1C1E" },
    typography: {
      largeTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
      body: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
      headline: { fontSize: 16, lineHeight: 21, fontWeight: "600" }
    },
    fontSize: { 12: 12, 14: 14 }
  } as unknown as Theme;
}

test("a text scale of one keeps the theme itself", () => {
  const theme = themeStub("light");
  assert.equal(themeWithTextScale(theme, 1), theme);
});

test("a larger text scale grows type sizes and line heights, and leaves colors alone", () => {
  const theme = themeStub("light");
  const scaled = themeWithTextScale(theme, 1.5);

  assert.equal(scaled.typography.largeTitle.fontSize, 45);
  assert.equal(scaled.typography.largeTitle.lineHeight, 54);
  assert.equal(scaled.typography.body.lineHeight, 30);
  assert.equal(scaled.typography.headline.fontWeight, "600");
  assert.equal((scaled.fontSize as unknown as Record<number, number>)[12], 18);
  assert.equal(scaled.colors, theme.colors);
  assert.equal(scaled.name, "light");
});

test("the scaled theme is stable per theme and scale so style sheets are reused", () => {
  const light = themeStub("light");
  const dark = themeStub("dark");
  assert.equal(themeWithTextScale(light, 1.5), themeWithTextScale(light, 1.5));
  assert.notEqual(themeWithTextScale(light, 1.5), themeWithTextScale(light, 1.4));
  assert.notEqual(themeWithTextScale(light, 1.5), themeWithTextScale(dark, 1.5));
});
