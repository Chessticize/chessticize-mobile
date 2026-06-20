import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSprintConfig,
  calculateRatingUpdate,
  createDefaultRating,
  ratingKeyForConfig,
  resetRating
} from "../src/index.ts";

test("ratingKeyForConfig and buildSprintConfig keep custom sprint buckets separate", () => {
  assert.equal(
    ratingKeyForConfig({
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 15,
      theme: "fork"
    }),
    "fork custom 3/15"
  );

  assert.deepEqual(
    buildSprintConfig({
      mode: "custom",
      durationSeconds: 95,
      perPuzzleSeconds: 10,
      targetCorrect: 8,
      maxMistakes: 2
    }),
    {
      mode: "custom",
      durationSeconds: 95,
      perPuzzleSeconds: 10,
      targetCorrect: 8,
      maxMistakes: 2,
      ratingKey: "custom 95s/10"
    }
  );
});

test("buildSprintConfig rejects invalid timing and target inputs", () => {
  assert.throws(
    () => buildSprintConfig({ mode: "standard", durationSeconds: 0, perPuzzleSeconds: 20 }),
    /durationSeconds/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 0 }),
    /perPuzzleSeconds/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 0 }),
    /targetCorrect/
  );
});

test("rating helpers create, update, floor, and reset rating generations", () => {
  const rating = createDefaultRating("standard 5/20");
  assert.deepEqual(rating, {
    key: "standard 5/20",
    generation: 0,
    rating: 600,
    games: 0
  });

  assert.ok(calculateRatingUpdate({ currentRating: 600, opponentRating: 1800, score: 1 }) > 600);
  assert.equal(calculateRatingUpdate({ currentRating: 600, opponentRating: 1800, score: 0 }), 600);

  assert.deepEqual(resetRating({ ...rating, rating: 900, games: 10 }), {
    key: "standard 5/20",
    generation: 1,
    rating: 600,
    games: 0
  });
});
