import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_THEME_SELECTION,
  curatedPuzzleThemes,
  namedThemesForSelection,
  nextThemeChoiceSelection,
  normalizeThemeChoiceSelection,
  puzzleMatchesAnyTheme,
  SERVER_CURATED_THEME_GROUPS,
  SERVER_CURATED_THEMES
} from "../src/index.ts";

test("the domain catalog contains the 24 unique server-curated themes in four groups", () => {
  assert.deepEqual(SERVER_CURATED_THEMES, [
    "mateIn1", "mateIn2", "mateIn3", "mateIn4", "backRankMate", "smotheredMate",
    "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "xRayAttack",
    "hangingPiece", "trappedPiece", "capturingDefender",
    "sacrifice", "deflection", "attraction", "intermezzo", "interference",
    "advancedPawn", "pawnEndgame", "promotion", "zugzwang"
  ]);
  assert.equal(new Set(SERVER_CURATED_THEMES).size, 24);
  assert.equal(SERVER_CURATED_THEME_GROUPS.length, 4);
});

test("theme choices normalize to All and keep All mutually exclusive with named themes", () => {
  assert.deepEqual(normalizeThemeChoiceSelection(), [ALL_THEME_SELECTION]);
  assert.deepEqual(normalizeThemeChoiceSelection([]), [ALL_THEME_SELECTION]);
  assert.deepEqual(
    normalizeThemeChoiceSelection([ALL_THEME_SELECTION, "pin", "fork", "pin"]),
    ["fork", "pin"]
  );
  assert.deepEqual(namedThemesForSelection([ALL_THEME_SELECTION]), []);
});

test("theme choice toggles restore All after the last named theme is removed", () => {
  let selection = nextThemeChoiceSelection([ALL_THEME_SELECTION], "pin");
  assert.deepEqual(selection, ["pin"]);
  selection = nextThemeChoiceSelection(selection, "fork");
  assert.deepEqual(selection, ["fork", "pin"]);
  selection = nextThemeChoiceSelection(selection, "pin");
  assert.deepEqual(selection, ["fork"]);
  selection = nextThemeChoiceSelection(selection, "fork");
  assert.deepEqual(selection, [ALL_THEME_SELECTION]);
  assert.deepEqual(nextThemeChoiceSelection(selection, ALL_THEME_SELECTION), [ALL_THEME_SELECTION]);
});

test("legacy named selections remain usable while new choices follow catalog order", () => {
  assert.deepEqual(
    normalizeThemeChoiceSelection(["mate", "pin", "mate"]),
    ["pin", "mate"]
  );
  assert.deepEqual(
    nextThemeChoiceSelection(["mate"], "fork"),
    ["fork", "mate"]
  );
});

test("retired legacy themes remain matchable but are omitted from curated display", () => {
  const restoredSelection = normalizeThemeChoiceSelection(["mate", "fork"]);

  assert.deepEqual(restoredSelection, ["fork", "mate"]);
  assert.equal(puzzleMatchesAnyTheme(["mate"], restoredSelection), true);
  assert.deepEqual(curatedPuzzleThemes(restoredSelection), ["fork"]);
});

test("theme matching uses OR semantics and treats All as unrestricted", () => {
  assert.equal(puzzleMatchesAnyTheme(["pin"], ["fork", "pin"]), true);
  assert.equal(puzzleMatchesAnyTheme(["skewer"], ["fork", "pin"]), false);
  assert.equal(puzzleMatchesAnyTheme(["skewer"], [ALL_THEME_SELECTION]), true);
  assert.equal(puzzleMatchesAnyTheme(["skewer"], []), true);
});

test("curated puzzle tags omit metadata and preserve catalog display order", () => {
  assert.deepEqual(
    curatedPuzzleThemes(["endgame", "pin", "mateIn2", "pin", "master"]),
    ["mateIn2", "pin"]
  );
});
