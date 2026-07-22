import assert from "node:assert/strict";
import test from "node:test";
import { LAB_PUZZLES } from "./labPuzzles.ts";
import {
  SERVER_CURATED_THEME_GROUPS,
  SERVER_CURATED_THEMES,
  SERVER_CURATED_THEME_PRESENTATION,
  THEME_CATALOG_LAB_PUZZLES
} from "./themeCatalogPrototype.ts";

test("the prototype exposes the 24 unique server-curated themes", () => {
  assert.equal(SERVER_CURATED_THEMES.length, 24);
  assert.equal(new Set(SERVER_CURATED_THEMES).size, 24);
  assert.equal(SERVER_CURATED_THEME_GROUPS.length, 4);
});

test("the deterministic fixtures cover the full catalog and the seven-tag density case", () => {
  const fixtureThemes = new Set(THEME_CATALOG_LAB_PUZZLES.flatMap((puzzle) => puzzle.themes));
  const curatedThemes = new Set<string>(SERVER_CURATED_THEMES);
  assert.deepEqual(
    SERVER_CURATED_THEMES.filter((theme) => !fixtureThemes.has(theme)),
    []
  );
  assert.equal(
    Math.max(...THEME_CATALOG_LAB_PUZZLES.map((puzzle) => puzzle.themes.filter((theme) => curatedThemes.has(theme)).length)),
    7
  );
});

test("the theme catalog density fixture does not change unrelated Lab stories", () => {
  assert.deepEqual(
    LAB_PUZZLES.map((puzzle) => puzzle.themes),
    [
      ["fork", "endgame"],
      ["pin", "middlegame"],
      ["skewer", "endgame"],
      ["sacrifice", "middlegame"],
      ["promotion", "endgame"]
    ]
  );
  assert.notDeepEqual(THEME_CATALOG_LAB_PUZZLES[0]!.themes, LAB_PUZZLES[0]!.themes);
});

test("the selected presentation uses the complete grouped catalog", () => {
  assert.equal(SERVER_CURATED_THEME_PRESENTATION.groups, SERVER_CURATED_THEME_GROUPS);
});
