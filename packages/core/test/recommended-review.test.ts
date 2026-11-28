import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME,
  isEligibleForRecommendedGamePuzzleReview,
  selectRecommendedGamePuzzleIds,
  type RecommendedGamePuzzleCandidate
} from "../src/index.ts";

function makeCandidate(
  overrides: Partial<Omit<RecommendedGamePuzzleCandidate, "clockRemainingSec" | "timeSpentSec">> & {
    clockRemainingSec?: number | undefined;
    timeSpentSec?: number | undefined;
  } = {}
): RecommendedGamePuzzleCandidate {
  const clockRemainingSec =
    "clockRemainingSec" in overrides ? overrides.clockRemainingSec : 120;
  const timeSpentSec = "timeSpentSec" in overrides ? overrides.timeSpentSec : 12;
  return {
    id: overrides.id ?? "ug_1",
    gameId: overrides.gameId ?? "g1",
    gamePly: overrides.gamePly ?? 12,
    rating: overrides.rating ?? 1500,
    ratingSource: overrides.ratingSource ?? "maia2_sf_v1",
    ...(clockRemainingSec !== undefined ? { clockRemainingSec } : {}),
    ...(timeSpentSec !== undefined ? { timeSpentSec } : {}),
    timeClass: overrides.timeClass ?? "blitz",
    caliberScore: overrides.caliberScore ?? 80,
    archived: overrides.archived ?? false
  };
}

test("excludes time_trouble and impulsive blunders while keeping deliberate, normal-pace, and clockless puzzles", () => {
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: 12, timeSpentSec: 5, timeClass: "blitz" }),
      { userRating: 1500 }
    ),
    false
  );
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: 9, timeSpentSec: 4, timeClass: "bullet" }),
      { userRating: 1500 }
    ),
    false
  );
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: 120, timeSpentSec: 1.8, timeClass: "rapid" }),
      { userRating: 1500 }
    ),
    false
  );
  // Deliberate (>= 10s)
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: 120, timeSpentSec: 14, timeClass: "rapid" }),
      { userRating: 1500 }
    ),
    true
  );
  // Normal blitz thinking (3-9s)
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: 90, timeSpentSec: 6, timeClass: "blitz" }),
      { userRating: 1500 }
    ),
    true
  );
  // Clockless PGN import
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ clockRemainingSec: undefined, timeSpentSec: undefined, timeClass: "other" }),
      { userRating: 1500 }
    ),
    true
  );
});

test("enforces +300 difficulty upper bound with no lower bound, and respects requireEstimatedRating", () => {
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 900, ratingSource: "maia2_sf_v1" }),
      { userRating: 1500 }
    ),
    true
  );
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 1800, ratingSource: "maia2_sf_v1" }),
      { userRating: 1500 }
    ),
    true
  );
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 1801, ratingSource: "maia2_sf_v1" }),
      { userRating: 1500 }
    ),
    false
  );
  // Unrated anchor puzzle passes manual recommendation check, but waits when requireEstimatedRating=true
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 2000, ratingSource: "game_anchor" }),
      { userRating: 1500 }
    ),
    true
  );
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 1500, ratingSource: "game_anchor" }),
      { userRating: 1500, requireEstimatedRating: true }
    ),
    false
  );
});

test("selects at most top 2 highest-caliber eligible puzzles per game", () => {
  assert.equal(DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME, 2);
  const selected = selectRecommendedGamePuzzleIds(
    [
      makeCandidate({ id: "g1-a", gameId: "g1", gamePly: 10, caliberScore: 70 }),
      makeCandidate({ id: "g1-b", gameId: "g1", gamePly: 14, caliberScore: 95 }),
      makeCandidate({ id: "g1-c", gameId: "g1", gamePly: 18, caliberScore: 85 }),
      makeCandidate({
        id: "g1-time",
        gameId: "g1",
        gamePly: 22,
        caliberScore: 99,
        clockRemainingSec: 5
      }),
      makeCandidate({ id: "g2-a", gameId: "g2", gamePly: 12, caliberScore: 60 }),
      makeCandidate({
        id: "g2-stretch",
        gameId: "g2",
        gamePly: 16,
        caliberScore: 99,
        rating: 1950
      })
    ],
    {
      getUserRating: () => 1500
    }
  );
  assert.deepEqual([...selected].sort(), ["g1-b", "g1-c", "g2-a"]);
});
