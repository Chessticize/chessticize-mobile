import assert from "node:assert/strict";
import test from "node:test";
import { LAB_PUZZLES } from "./labPuzzles.ts";
import {
  SERVER_CURATED_THEME_GROUPS,
  SERVER_CURATED_THEMES,
  THEME_CATALOG_PROTOTYPE_VARIANTS,
  isThemeCatalogPrototypeVariant
} from "./themeCatalogPrototype.ts";

test("the prototype exposes the 24 unique server-curated themes", () => {
  assert.equal(SERVER_CURATED_THEMES.length, 24);
  assert.equal(new Set(SERVER_CURATED_THEMES).size, 24);
  assert.equal(SERVER_CURATED_THEME_GROUPS.length, 4);
});

test("the deterministic fixtures cover the full catalog and the seven-tag density case", () => {
  const fixtureThemes = new Set(LAB_PUZZLES.flatMap((puzzle) => puzzle.themes));
  const curatedThemes = new Set<string>(SERVER_CURATED_THEMES);
  assert.deepEqual(
    SERVER_CURATED_THEMES.filter((theme) => !fixtureThemes.has(theme)),
    []
  );
  assert.equal(
    Math.max(...LAB_PUZZLES.map((puzzle) => puzzle.themes.filter((theme) => curatedThemes.has(theme)).length)),
    7
  );
});

test("all three shareable prototype variants are recognized", () => {
  assert.deepEqual(THEME_CATALOG_PROTOTYPE_VARIANTS.map((variant) => variant.id), [
    "wrap",
    "rails",
    "groups"
  ]);
  assert.equal(isThemeCatalogPrototypeVariant("wrap"), true);
  assert.equal(isThemeCatalogPrototypeVariant("unknown"), false);
});
