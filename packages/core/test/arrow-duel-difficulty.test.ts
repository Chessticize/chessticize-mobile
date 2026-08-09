import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_ARROW_DUEL_DIFFICULTIES,
  arrowDuelDifficultyLabel,
  normalizeArrowDuelDifficulties,
  restrictedArrowDuelDifficulties,
  toggleArrowDuelDifficulty
} from "../src/index.ts";

test("Arrow Duel difficulty defaults to every compact bucket", () => {
  assert.deepEqual(normalizeArrowDuelDifficulties(), [0, 1, 2, 3, 4]);
  assert.deepEqual(ALL_ARROW_DUEL_DIFFICULTIES, [0, 1, 2, 3, 4]);
  assert.equal(restrictedArrowDuelDifficulties([4, 2, 0, 3, 1]), undefined);
});

test("Arrow Duel difficulty selection is sorted, unique, and keeps one option", () => {
  assert.deepEqual(normalizeArrowDuelDifficulties([4, 2, 4]), [2, 4]);
  assert.deepEqual(toggleArrowDuelDifficulty([0, 1, 2, 3, 4], 2), [0, 1, 3, 4]);
  assert.deepEqual(toggleArrowDuelDifficulty([4], 4), [4]);
  assert.deepEqual(toggleArrowDuelDifficulty([1, 4], 2), [1, 2, 4]);
  assert.equal(arrowDuelDifficultyLabel(4), "4+");
});

test("Arrow Duel difficulty rejects unavailable or empty buckets", () => {
  assert.throws(() => normalizeArrowDuelDifficulties([]), /at least one/u);
  assert.throws(() => normalizeArrowDuelDifficulties([5]), /0 through 4/u);
  assert.throws(() => normalizeArrowDuelDifficulties([1.5]), /0 through 4/u);
});
