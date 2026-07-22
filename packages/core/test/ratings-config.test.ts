import test from "node:test";
import assert from "node:assert/strict";
import {
  applySprintRatingChange,
  assertValidManualRating,
  buildSprintConfig,
  calculateSprintRatingChange,
  calculateRatingUpdate,
  clampManualRating,
  createDefaultRating,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  normalizeThemeSelection,
  ratingKeyForConfig,
  resetRating,
  stepManualRating
} from "../src/index.ts";

test("manual rating edits share the 25-point step and 600 floor", () => {
  assert.equal(stepManualRating(625, -1), 600);
  assert.equal(stepManualRating(600, -1), 600);
  assert.equal(stepManualRating(600, 1), 625);
  assert.equal(clampManualRating(575), 600);
  assert.doesNotThrow(() => assertValidManualRating(600));
  assert.throws(() => assertValidManualRating(599), /at least 600/);
  assert.throws(() => clampManualRating(600.5), /integer/);
});

test("ratingKeyForConfig and buildSprintConfig keep custom sprint buckets separate", () => {
  assert.equal(
    ratingKeyForConfig({
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 15,
      themes: ["fork"]
    }),
    "fork custom 3/15"
  );

  assert.deepEqual(
    normalizeThemeSelection(["pin", "fork", "pin"]),
    ["fork", "pin"]
  );
  assert.equal(
    ratingKeyForConfig({
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 15,
      themes: ["pin", "fork", "fork"]
    }),
    "fork+pin custom 3/15"
  );
  assert.deepEqual(
    buildSprintConfig({
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 15,
      themes: ["pin", "fork", "pin"]
    }),
    {
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 15,
      targetCorrect: 12,
      maxMistakes: 3,
      ratingKey: "fork+pin custom 3/15",
      themes: ["fork", "pin"]
    }
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
  assert.throws(
    () => buildSprintConfig({ mode: "custom", durationSeconds: 180.5, perPuzzleSeconds: 20 }),
    /durationSeconds/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "custom", durationSeconds: 180, perPuzzleSeconds: 10.5 }),
    /perPuzzleSeconds/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "custom", durationSeconds: 180, perPuzzleSeconds: 30, targetCorrect: 1.5 }),
    /targetCorrect/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "custom", durationSeconds: 180, perPuzzleSeconds: 30, maxMistakes: 0 }),
    /maxMistakes/
  );
  assert.throws(
    () => buildSprintConfig({ mode: "custom", durationSeconds: 180, perPuzzleSeconds: 30, maxMistakes: 1.5 }),
    /maxMistakes/
  );
});

test("rating helpers create, update, floor, and reset rating generations", () => {
  const rating = createDefaultRating("standard 5/20");
  assert.deepEqual(rating, {
    key: "standard 5/20",
    generation: 0,
    rating: 600,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    games: 0
  });

  assert.equal(calculateRatingUpdate({ currentRating: 600, score: 1 }), 775);
  assert.equal(calculateRatingUpdate({ currentRating: 600, score: 0 }), 600);

  assert.deepEqual(resetRating({ ...rating, rating: 900, games: 10 }), {
    key: "standard 5/20",
    generation: 1,
    rating: 600,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    games: 0
  });
});

test("sprint rating changes match server-compatible Glicko-2 cold-start behavior", () => {
  const rating = createDefaultRating("standard 5/20");
  const change = calculateSprintRatingChange({ rating, won: true });

  assert.equal(change.ratingBefore, 600);
  assert.equal(change.ratingAfter, 775);
  assert.equal(change.ratingChange, 175);
  assert.equal(change.ratingDeviationBefore, DEFAULT_RATING_DEVIATION);
  assert.ok(Math.abs(change.ratingDeviationAfter - 248.17054151409985) < 0.000001);
  assert.equal(change.volatilityBefore, DEFAULT_VOLATILITY);
  assert.equal(change.volatilityAfter, DEFAULT_VOLATILITY);

  assert.deepEqual(applySprintRatingChange(rating, change), {
    key: "standard 5/20",
    generation: 0,
    rating: 775,
    ratingDeviation: change.ratingDeviationAfter,
    volatility: DEFAULT_VOLATILITY,
    games: 1
  });
});

test("sprint rating changes preserve floor and decay volatility after provisional games", () => {
  const loss = calculateSprintRatingChange({ rating: createDefaultRating("standard 5/20"), won: false });

  assert.equal(loss.ratingAfter, 600);
  assert.equal(loss.ratingChange, 0);
  assert.ok(loss.ratingDeviationAfter < DEFAULT_RATING_DEVIATION);

  const established = {
    key: "standard 5/20",
    generation: 0,
    rating: 1200,
    ratingDeviation: 80,
    volatility: DEFAULT_VOLATILITY,
    games: 10
  };
  const establishedChange = calculateSprintRatingChange({ rating: established, won: true });
  assert.ok(Math.abs(establishedChange.volatilityAfter - 0.0594) < 0.000001);
});
