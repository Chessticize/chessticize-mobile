import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DIAGNOSIS_BLINDSPOTS,
  MIN_GAMES_FOR_DIAGNOSIS,
  SERVER_CURATED_THEMES,
  diagnoseInGameWeaknesses,
  type DiagnosisAnalyzedGameInput,
  type DiagnosisPlyEvalInput,
  type DiagnosisUserPuzzleInput
} from "../src/index.ts";

function analyzedGame(
  id: string,
  overrides: Partial<DiagnosisAnalyzedGameInput> = {}
): DiagnosisAnalyzedGameInput {
  return {
    id,
    timeClass: "blitz",
    userColor: "w",
    whiteAccuracy: 82,
    blackAccuracy: 78,
    analysisStatus: "complete",
    ...overrides
  };
}

function userPuzzle(
  gameId: string,
  overrides: Partial<DiagnosisUserPuzzleInput> = {}
): DiagnosisUserPuzzleInput {
  return {
    gameId,
    momentKind: "own_blunder_punished",
    puzzleKind: "arrow_duel",
    themes: ["fork", "middlegame"],
    timeClass: "blitz",
    caliberScore: 80,
    ...overrides
  };
}

test("hides diagnosis and returns insufficient_data when fewer than MIN_GAMES_FOR_DIAGNOSIS are analyzed", () => {
  assert.equal(MIN_GAMES_FOR_DIAGNOSIS, 3);

  const result = diagnoseInGameWeaknesses({
    games: [
      analyzedGame("g1", { analysisStatus: "complete", whiteAccuracy: 85 }),
      analyzedGame("g2", { analysisStatus: "pass1_done", whiteAccuracy: 79 }),
      analyzedGame("g3", { analysisStatus: "partial", whiteAccuracy: 70 }),
      analyzedGame("g4", { analysisStatus: "none" })
    ],
    puzzles: [
      userPuzzle("g1", { themes: ["fork"], momentKind: "own_blunder_punished" }),
      userPuzzle("g2", { themes: ["fork"], momentKind: "own_blunder_punished" }),
      userPuzzle("g3", { themes: ["fork"], momentKind: "own_blunder_punished" })
    ]
  });

  assert.equal(result.sufficientData, false);
  assert.equal(result.minGamesRequired, 3);
  assert.equal(result.analyzedGameCount, 2);
  assert.equal(result.totalPuzzlesAnalyzed, 2);
  assert.deepEqual(result.topBlindspots, []);
  assert.equal(result.headlineKind, "insufficient_data");
  assert.equal(result.headlineStats.analyzedGameCount, 2);
  assert.equal(result.headlineStats.gamesRemaining, 1);
  assert.equal(result.overallAccuracy, 82);
});

test("computes per-time-class summaries with userColor accuracy and mistake/opportunity rates", () => {
  const result = diagnoseInGameWeaknesses({
    games: [
      analyzedGame("r1", { timeClass: "rapid", userColor: "w", whiteAccuracy: 88, blackAccuracy: 60 }),
      analyzedGame("b1", { timeClass: "bullet", userColor: "b", whiteAccuracy: 90, blackAccuracy: 70 }),
      analyzedGame("b2", { timeClass: "bullet", userColor: "w", whiteAccuracy: 74, blackAccuracy: 92 }),
      analyzedGame("c1", { timeClass: "classical", userColor: "b", whiteAccuracy: 80, blackAccuracy: 91 }),
      analyzedGame("d1", { timeClass: "daily", userColor: "w", whiteAccuracy: 85 }),
      analyzedGame("u1", { timeClass: "unknown", userColor: "w", whiteAccuracy: 50 }),
      analyzedGame("z1", { timeClass: "blitz", userColor: "w", analysisStatus: "none", whiteAccuracy: 10 })
    ],
    puzzles: [
      userPuzzle("b1", { timeClass: "bullet", momentKind: "own_blunder_punished" }),
      userPuzzle("b1", { timeClass: "bullet", momentKind: "own_mistake_escaped" }),
      userPuzzle("b2", { timeClass: "bullet", momentKind: "opponent_mistake_missed", puzzleKind: "line" }),
      userPuzzle("r1", { timeClass: "rapid", momentKind: "opponent_blunder_missed" }),
      userPuzzle("r1", { timeClass: "rapid", momentKind: "own_blunder_punished", archived: true }),
      // Opponent caught moments must never count as mistakes or missed opportunities
      userPuzzle("r1", { timeClass: "rapid", momentKind: "opponent_blunder_caught" })
    ]
  });

  assert.equal(result.sufficientData, true);
  assert.equal(result.analyzedGameCount, 6);
  assert.deepEqual(
    result.timeClassSummaries.map((summary) => summary.timeClass),
    ["bullet", "rapid", "classical", "daily"]
  );

  const bullet = result.timeClassSummaries[0]!;
  assert.equal(bullet.gameCount, 2);
  assert.equal(bullet.averageAccuracy, 72);
  assert.equal(bullet.ownMistakeCount, 2);
  assert.equal(bullet.missedOpportunityCount, 1);
  assert.equal(bullet.ownMistakesPerGame, 1);
  assert.equal(bullet.missedOpportunitiesPerGame, 0.5);

  const rapid = result.timeClassSummaries[1]!;
  assert.equal(rapid.gameCount, 1);
  assert.equal(rapid.averageAccuracy, 88);
  assert.equal(rapid.ownMistakeCount, 0);
  assert.equal(rapid.missedOpportunityCount, 1);
  assert.equal(rapid.missedOpportunitiesPerGame, 1);

  const classical = result.timeClassSummaries[2]!;
  assert.equal(classical.averageAccuracy, 91);
});

test("classifies clock timing breakdown from puzzles using classifyClockBucket thresholds", () => {
  const result = diagnoseInGameWeaknesses({
    games: [
      analyzedGame("g1", { timeClass: "bullet" }),
      analyzedGame("g2", { timeClass: "blitz" }),
      analyzedGame("g3", { timeClass: "rapid" })
    ],
    puzzles: [
      // Bullet: 9s remaining -> time_trouble (threshold <= 10s)
      userPuzzle("g1", {
        timeClass: "bullet",
        momentKind: "own_blunder_punished",
        clockRemainingSec: 9,
        timeSpentSec: 1
      }),
      // Blitz: 12s remaining -> time_trouble (threshold <= 15s)
      userPuzzle("g2", {
        timeClass: "blitz",
        momentKind: "own_mistake_punished",
        clockRemainingSec: 12,
        timeSpentSec: 4
      }),
      // Rapid: 240s remaining, 1.5s spent -> impulsive
      userPuzzle("g3", {
        timeClass: "rapid",
        momentKind: "own_blunder_escaped",
        clockRemainingSec: 240,
        timeSpentSec: 1.5
      }),
      // Rapid: 200s remaining, 18s spent -> deliberate
      userPuzzle("g3", {
        timeClass: "rapid",
        momentKind: "own_mistake_escaped",
        clockRemainingSec: 200,
        timeSpentSec: 18
      }),
      // Missing clock -> unknown
      userPuzzle("g2", {
        timeClass: "blitz",
        momentKind: "own_blunder_punished"
      }),
      // Opponent missed moment must NOT enter own-mistake clock breakdown
      userPuzzle("g3", {
        timeClass: "rapid",
        momentKind: "opponent_mistake_missed",
        puzzleKind: "line",
        clockRemainingSec: 5,
        timeSpentSec: 1
      })
    ]
  });

  const breakdown = result.clockTimingBreakdown;
  assert.equal(breakdown.source, "puzzles");
  assert.equal(breakdown.totalOwnMistakes, 5);
  assert.equal(breakdown.knownClockOwnMistakes, 4);
  assert.deepEqual(breakdown.counts, {
    time_trouble: 2,
    impulsive: 1,
    deliberate: 1,
    unknown: 1
  });
  assert.equal(breakdown.shares.time_trouble, 0.4);
  assert.equal(breakdown.knownShares.time_trouble, 0.5);
  assert.equal(breakdown.knownShares.impulsive, 0.25);
  assert.equal(breakdown.knownShares.deliberate, 0.25);
  assert.equal(result.headlineKind, "time_trouble");
  assert.equal(result.headlineStats.dominantClockBucket, "time_trouble");
  assert.equal(result.headlineStats.dominantClockCount, 2);
});

test("uses optional plyEvaluations for clock buckets when supplied and ignores opponent or good moves", () => {
  const games = [
    analyzedGame("g1", { timeClass: "rapid", userColor: "w" }),
    analyzedGame("g2", { timeClass: "rapid", userColor: "b" }),
    analyzedGame("g3", { timeClass: "rapid", userColor: "w" })
  ];

  const plyEvaluations: DiagnosisPlyEvalInput[] = [
    // g1: user (white) impulsive blunder + best move + opponent blunder (ignored)
    { gameId: "g1", ply: 11, color: "w", classification: "blunder", clockBucket: "impulsive" },
    { gameId: "g1", ply: 12, color: "b", classification: "blunder", clockBucket: "time_trouble" },
    { gameId: "g1", ply: 13, color: "w", classification: "best", clockBucket: "impulsive" },
    // g2: user (black) impulsive mistake derived from clockRemainingSec/timeSpentSec
    {
      gameId: "g2",
      ply: 14,
      color: "b",
      classification: "mistake",
      clockRemainingSec: 420,
      timeSpentSec: 1.2
    },
    // g3: user (white) missed_win while deliberate + impulsive blunder
    { gameId: "g3", ply: 19, color: "w", classification: "missed_win", clockBucket: "deliberate" },
    { gameId: "g3", ply: 23, color: "w", classification: "blunder", clockBucket: "impulsive" }
  ];

  const result = diagnoseInGameWeaknesses({
    games,
    puzzles: [
      userPuzzle("g1", { momentKind: "own_blunder_punished", clockRemainingSec: 5, timeSpentSec: 1 })
    ],
    plyEvaluations
  });

  assert.equal(result.clockTimingBreakdown.source, "ply_evaluations");
  assert.equal(result.clockTimingBreakdown.totalOwnMistakes, 4);
  assert.equal(result.clockTimingBreakdown.counts.impulsive, 3);
  assert.equal(result.clockTimingBreakdown.counts.deliberate, 1);
  assert.equal(result.clockTimingBreakdown.counts.time_trouble, 0);
  assert.equal(result.headlineKind, "impulsive");
  assert.equal(result.headlineStats.dominantClockBucket, "impulsive");
  assert.equal(result.headlineStats.dominantClockShare, 0.75);
});

test("ranks top blindspots with Bayesian smoothing, curated-theme filtering, and confidence levels", () => {
  const games = [
    analyzedGame("g1"),
    analyzedGame("g2"),
    analyzedGame("g3"),
    analyzedGame("g4")
  ];

  const puzzles: DiagnosisUserPuzzleInput[] = [
    // Recurring fork across 3 games (2 own mistakes + 1 missed opportunity -> established)
    userPuzzle("g1", {
      momentKind: "own_blunder_punished",
      themes: ["fork", "fork", "middlegame", "crushing"],
      caliberScore: 70
    }),
    userPuzzle("g2", {
      momentKind: "own_mistake_escaped",
      themes: ["fork", "short"],
      caliberScore: 72
    }),
    userPuzzle("g3", {
      momentKind: "opponent_mistake_missed",
      puzzleKind: "line",
      themes: ["fork", "advantage"],
      caliberScore: 68
    }),
    // 1-sample fluke smotheredMate with huge caliberScore must NOT outrank recurring themes
    userPuzzle("g4", {
      momentKind: "opponent_mistake_missed",
      puzzleKind: "line",
      themes: ["smotheredMate"],
      caliberScore: 165
    }),
    // 2 pins across 2 games vs 2 skewers in 1 game -> cross-game pin should outrank single-game skewer
    userPuzzle("g1", { momentKind: "own_mistake_punished", themes: ["pin"], caliberScore: 75 }),
    userPuzzle("g2", { momentKind: "opponent_blunder_missed", themes: ["pin"], caliberScore: 75 }),
    userPuzzle("g3", { momentKind: "own_mistake_punished", themes: ["skewer"], caliberScore: 75 }),
    userPuzzle("g3", { momentKind: "own_blunder_punished", themes: ["skewer"], caliberScore: 75 }),
    // Additional themes to verify top-5 cap
    userPuzzle("g4", { momentKind: "own_mistake_punished", themes: ["backRankMate"], caliberScore: 80 }),
    userPuzzle("g4", { momentKind: "own_mistake_punished", themes: ["hangingPiece"], caliberScore: 78 }),
    userPuzzle("g4", { momentKind: "own_mistake_punished", themes: ["deflection"], caliberScore: 60 })
  ];

  const result = diagnoseInGameWeaknesses({ games, puzzles });

  assert.equal(result.sufficientData, true);
  assert.equal(result.topBlindspots.length, MAX_DIAGNOSIS_BLINDSPOTS);
  for (const spot of result.topBlindspots) {
    assert.ok(SERVER_CURATED_THEMES.includes(spot.theme), `non-curated theme leaked: ${spot.theme}`);
  }

  // #1 must be fork (3 hits across 3 games, established)
  const top = result.topBlindspots[0]!;
  assert.equal(top.theme, "fork");
  assert.equal(top.totalCount, 3);
  assert.equal(top.ownMistakeCount, 2);
  assert.equal(top.missedOpportunityCount, 1);
  assert.equal(top.gameCount, 3);
  assert.equal(top.confidence, "established");
  assert.ok(top.smoothedRate < top.rawRate, "Bayesian smoothing should shrink raw rate toward prior");

  // #2 must be pin (2 hits across 2 games) ahead of #3 skewer (2 hits in 1 game)
  assert.equal(result.topBlindspots[1]?.theme, "pin");
  assert.equal(result.topBlindspots[1]?.confidence, "emerging");
  assert.equal(result.topBlindspots[2]?.theme, "skewer");
  assert.equal(result.topBlindspots[2]?.confidence, "emerging");
  assert.ok(
    (result.topBlindspots[1]?.priorityScore ?? 0) > (result.topBlindspots[2]?.priorityScore ?? 0)
  );

  // 1-sample high-caliber smotheredMate must rank strictly below recurring 2-sample themes
  const smotheredRank = result.topBlindspots.findIndex((spot) => spot.theme === "smotheredMate");
  assert.ok(smotheredRank >= 3, `expected 1-sample fluke below recurring themes, got index ${smotheredRank}`);

  assert.equal(result.headlineKind, "tactical_blindspot");
  assert.equal(result.headlineStats.primaryBlindspotTheme, "fork");
  assert.equal(result.headlineStats.primaryBlindspotConfidence, "established");
});

test("computes ownMistakeSplit and selects escaped_blunders headline when opponent repeatedly misses refutations", () => {
  const result = diagnoseInGameWeaknesses({
    games: [
      analyzedGame("g1"),
      analyzedGame("g2"),
      analyzedGame("g3")
    ],
    puzzles: [
      userPuzzle("g1", { momentKind: "own_blunder_escaped", themes: ["fork"] }),
      userPuzzle("g2", { momentKind: "own_mistake_escaped", themes: ["pin"] }),
      userPuzzle("g3", { momentKind: "own_blunder_escaped", themes: ["hangingPiece"] }),
      userPuzzle("g3", { momentKind: "own_blunder_punished", themes: ["skewer"] })
    ]
  });

  assert.deepEqual(result.ownMistakeSplit, {
    own_mistake_punished: 0,
    own_mistake_escaped: 1,
    own_blunder_punished: 1,
    own_blunder_escaped: 2,
    totalOwnMistakes: 4,
    totalPunished: 1,
    totalEscaped: 3,
    escapedRatio: 0.75,
    escapedPercent: 75
  });

  assert.equal(result.headlineKind, "escaped_blunders");
  assert.equal(result.headlineStats.escapedCount, 3);
  assert.equal(result.headlineStats.totalOwnMistakes, 4);
  assert.equal(result.headlineStats.escapedPercent, 75);
});

test("selects balanced headline when games are analyzed without dominant clock, blindspot, or escaped-blunder spikes", () => {
  const result = diagnoseInGameWeaknesses({
    games: [
      analyzedGame("g1", { whiteAccuracy: 90 }),
      analyzedGame("g2", { whiteAccuracy: 88 }),
      analyzedGame("g3", { whiteAccuracy: 92 })
    ],
    puzzles: [
      userPuzzle("g1", {
        momentKind: "own_mistake_punished",
        themes: ["fork"],
        clockRemainingSec: 180,
        timeSpentSec: 15
      }),
      userPuzzle("g2", {
        momentKind: "opponent_mistake_missed",
        puzzleKind: "line",
        themes: ["pin"]
      })
    ]
  });

  assert.equal(result.sufficientData, true);
  assert.equal(result.headlineKind, "balanced");
  assert.equal(result.overallAccuracy, 90);
  assert.equal(result.headlineStats.overallAccuracy, 90);
});
