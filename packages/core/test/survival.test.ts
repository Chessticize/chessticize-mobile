import test from "node:test";
import assert from "node:assert/strict";
import {
  SURVIVAL_LEVELS,
  advanceSprintTime,
  beginArrowDuelReply,
  pauseSprint,
  resumeSprint,
  startSurvival,
  submitSprintMove,
  survivalLevelForRating,
  survivalRunKey
} from "../src/index.ts";
import type { Puzzle, RatingRecord, SprintState, SurvivalChallengeType } from "../src/index.ts";

const NOW = "2026-08-11T12:00:00.000Z";
const RATING: RatingRecord = {
  key: "standard 5/20",
  generation: 2,
  rating: 943,
  ratingDeviation: 82,
  games: 12
};

test("Survival exposes the sixteen shipping levels and clamps recommendations", () => {
  assert.equal(SURVIVAL_LEVELS.length, 16);
  assert.deepEqual(SURVIVAL_LEVELS[0], { minRating: 600, maxRating: 699 });
  assert.deepEqual(SURVIVAL_LEVELS.at(-1), { minRating: 2100, maxRating: 2200 });
  assert.deepEqual(survivalLevelForRating(450), { minRating: 600, maxRating: 699 });
  assert.deepEqual(survivalLevelForRating(943), { minRating: 900, maxRating: 999 });
  assert.deepEqual(survivalLevelForRating(2400), { minRating: 2100, maxRating: 2200 });
  assert.equal(
    survivalRunKey({
      challengeType: "arrow_duel",
      level: { minRating: 2100, maxRating: 2200 }
    }),
    "arrow_duel:2100:2200:v1"
  );
});

test("Survival has no overall or per-puzzle timeout and records active time only", () => {
  const started = survivalState("puzzle", [oneMovePuzzle("p1"), oneMovePuzzle("p2")]);
  const muchLater = "2036-08-11T12:00:00.000Z";

  assert.equal(started.currentPuzzleDeadlineAt, undefined);
  assert.equal(advanceSprintTime(started, muchLater).state, started);
  const solved = submitSprintMove(started, "e6e7", muchLater);

  assert.equal(solved.attempt?.result, "correct");
  assert.equal(solved.attempt?.timingStatus, undefined);
  assert.equal(solved.attempt?.unclear, undefined);
  assert.equal(solved.state.status, "active");
  assert.equal(solved.state.ratingAfter, undefined);
});

test("the third wrong Survival puzzle completes normally without changing Rating", () => {
  let state = survivalState("puzzle", [
    oneMovePuzzle("p1"),
    oneMovePuzzle("p2"),
    oneMovePuzzle("p3"),
    oneMovePuzzle("p4")
  ]);

  for (let index = 0; index < 3; index += 1) {
    state = submitSprintMove(
      state,
      "e6d6",
      new Date(Date.parse(NOW) + (index + 1) * 1000).toISOString()
    ).state;
  }

  assert.equal(state.status, "won");
  assert.equal(state.endReason, "max_mistakes");
  assert.equal(state.mistakeCount, 3);
  assert.equal(state.ratingAfter, undefined);
});

test("solving the eligible pool completes Survival as a Perfect clear", () => {
  const started = survivalState("puzzle", [oneMovePuzzle("only")], 1);
  const solved = submitSprintMove(started, "e6e7", "2026-08-11T12:00:01.000Z");

  assert.equal(solved.state.status, "won");
  assert.equal(solved.state.endReason, "pool_cleared");
  assert.equal(solved.state.correctCount, 1);
  assert.equal(solved.state.ratingAfter, undefined);
});

test("pausing Survival freezes active time without extending a scoring deadline", () => {
  const started = survivalState("puzzle", [oneMovePuzzle("p1"), oneMovePuzzle("p2")]);
  const paused = pauseSprint(started, "2026-08-11T12:00:05.000Z").state;
  const resumed = resumeSprint(paused, "2026-08-11T12:01:05.000Z");

  assert.equal(paused.survival?.pauseCount, 1);
  assert.equal(resumed.deadlineAt, started.deadlineAt);
  assert.equal(resumed.currentPuzzleStartedAt, "2026-08-11T12:01:00.000Z");
  assert.equal(resumed.totalPausedMs, 60_000);
  const solved = submitSprintMove(resumed, "e6e7", "2026-08-11T12:01:10.000Z");
  assert.equal(solved.attempt?.elapsedMs, 10_000);
});

test("Arrow Duel Survival requires the reply but never times it out", () => {
  const started = survivalState("arrow_duel", [arrowPuzzle("p1"), arrowPuzzle("p2")]);
  const choice = submitSprintMove(started, "b2b1", "2026-08-11T12:00:03.000Z");
  const replying = beginArrowDuelReply(choice.state, "2026-08-11T12:00:04.000Z");

  assert.equal(replying.currentPuzzle?.kind, "arrow_duel");
  assert.equal(replying.currentPuzzle?.phase, "reply");
  assert.equal(replying.currentPuzzle?.replyDeadlineAt, undefined);
  assert.equal(
    advanceSprintTime(replying, "2036-08-11T12:00:00.000Z").attempt,
    undefined
  );

  const solved = submitSprintMove(replying, "e6e7", "2036-08-11T12:00:00.000Z");
  assert.equal(solved.attempt?.result, "correct");
  assert.equal(solved.state.correctCount, 1);
});

test("Arrow Duel Survival completes after the candidate when opponent replies are globally off", () => {
  const started = survivalState(
    "arrow_duel",
    [arrowPuzzle("p1"), arrowPuzzle("p2")],
    4,
    false
  );
  const solved = submitSprintMove(started, "b2b1", "2026-08-11T12:00:03.000Z");

  assert.equal(solved.attempt?.result, "correct");
  assert.equal(solved.state.correctCount, 1);
  assert.equal(solved.state.currentPuzzle?.kind, "arrow_duel");
  assert.equal(solved.state.currentPuzzle?.phase, "choice");
  assert.equal(solved.state.currentPuzzle?.puzzle.id, "p2");
});

test("Arrow Duel Survival rejects a wrong candidate without opening a reply when globally off", () => {
  const started = survivalState(
    "arrow_duel",
    [arrowPuzzle("p1"), arrowPuzzle("p2")],
    4,
    false
  );
  const failed = submitSprintMove(started, "f2g3", "2026-08-11T12:00:03.000Z");

  assert.equal(failed.attempt?.result, "wrong");
  assert.equal(failed.state.correctCount, 0);
  assert.equal(failed.state.mistakeCount, 1);
  assert.equal(failed.state.currentPuzzle?.kind, "arrow_duel");
  assert.equal(failed.state.currentPuzzle?.phase, "choice");
  assert.equal(failed.state.currentPuzzle?.puzzle.id, "p2");
});

function survivalState(
  challengeType: SurvivalChallengeType,
  puzzles: Puzzle[],
  eligibleCount = Math.max(4, puzzles.length),
  opponentReplyEnabled = true
): SprintState {
  return startSurvival({
    challengeType,
    opponentReplyEnabled,
    level: { minRating: 900, maxRating: 999 },
    ratingSourceRunId: challengeType === "arrow_duel" ? "arrow-duel" : "standard",
    ratingSource: RATING,
    packVersion: 5,
    packHash: "sha256:test-pack",
    eligibleCount,
    selectionSeed: "survival-test",
    initialPuzzles: puzzles,
    selectionStartPuzzleId: puzzles[0]!.id,
    selectionCursorPuzzleId: puzzles.at(-1)!.id,
    selectionWrapped: false,
    poolExhaustedAfterBuffer: eligibleCount === puzzles.length,
    bestBefore: null,
    now: NOW
  });
}

function oneMovePuzzle(id: string): Puzzle {
  return {
    ...arrowPuzzle(id),
    solutionMoves: ["f2g3", "e6e7"]
  };
}

function arrowPuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 943,
    themes: ["crushing"],
    source: "synthetic",
    stockfishBestMove: "b2b1"
  };
}
