import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME,
  computeEffectiveReviewBenchmarkRating,
  isEligibleForRecommendedGamePuzzleReview,
  normalizeGameRatingToPuzzleScale,
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

test("normalizeGameRatingToPuzzleScale calibrates Chess.com onto Lichess/Maia scale while preserving Lichess/Maia", () => {
  // Chess.com Blitz 1200 -> ~1550 Lichess; Chess.com Rapid 1450 -> ~1700 Lichess
  assert.equal(normalizeGameRatingToPuzzleScale(1200, "chess_com", "blitz"), 1550);
  assert.equal(normalizeGameRatingToPuzzleScale(1450, "chess_com", "rapid"), 1700);
  // Converges smoothly near 2400
  assert.equal(normalizeGameRatingToPuzzleScale(2400, "chess_com", "rapid"), 2400);
  // Lichess Rapid & Maia are already on Lichess scale
  assert.equal(normalizeGameRatingToPuzzleScale(1650, "lichess", "rapid"), 1650);
  assert.equal(normalizeGameRatingToPuzzleScale(1500, "maia", "rapid"), 1500);
  // Lichess Blitz gets a modest +75 lift below 1800
  assert.equal(normalizeGameRatingToPuzzleScale(1500, "lichess", "blitz"), 1575);
});

test("computeEffectiveReviewBenchmarkRating takes calibrated max across games, Maia, and puzzle ratings", () => {
  // Chess.com Blitz 1180 game + Chess.com Rapid 1450 recent + low Chessticize puzzle rating 750:
  // Rapid 1450 -> 1700 Lichess wins, never dragged down by low puzzle rating!
  const benchmark = computeEffectiveReviewBenchmarkRating({
    gameRating: { rating: 1180, platform: "chess_com", timeClass: "blitz" },
    recentGameRatings: [
      { rating: 1450, platform: "chess_com", timeClass: "rapid" },
      { rating: 1180, platform: "chess_com", timeClass: "blitz" }
    ],
    puzzleRatings: [{ rating: 750, games: 10 }],
    maiaRatings: [{ rating: 1520, games: 2 }]
  });
  assert.equal(benchmark, 1700);

  // So a ~1529 Lichess-scale puzzle from the Chess.com Blitz 1180 game is cleanly recommended!
  assert.equal(
    isEligibleForRecommendedGamePuzzleReview(
      makeCandidate({ rating: 1529, ratingSource: "maia2_sf_v1" }),
      { userRating: benchmark }
    ),
    true
  );

  // If the player's puzzle rating later grows above 1800 (with >=3 games), it lifts the ceiling
  const grown = computeEffectiveReviewBenchmarkRating({
    gameRating: { rating: 1180, platform: "chess_com", timeClass: "blitz" },
    puzzleRatings: [
      { rating: 2050, games: 2 }, // <3 games ignored
      { rating: 1860, games: 5 }
    ]
  });
  assert.equal(grown, 1860);
});

test("excludedPuzzleIds prevents previously removed/retired puzzles from being re-recommended", () => {
  const selected = selectRecommendedGamePuzzleIds(
    [
      makeCandidate({ id: "g1-removed", gameId: "g1", gamePly: 10, caliberScore: 99 }),
      makeCandidate({ id: "g1-keep1", gameId: "g1", gamePly: 14, caliberScore: 85 }),
      makeCandidate({ id: "g1-keep2", gameId: "g1", gamePly: 18, caliberScore: 75 })
    ],
    {
      getUserRating: () => 1500,
      excludedPuzzleIds: new Set(["g1-removed"])
    }
  );
  assert.deepEqual([...selected].sort(), ["g1-keep1", "g1-keep2"]);
});
