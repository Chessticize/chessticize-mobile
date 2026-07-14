import test from "node:test";
import assert from "node:assert/strict";
import {
  abandonSprint,
  buildSprintConfig,
  defaultSprintConfig,
  pauseSprint,
  resumeSprint,
  serializeSprintView,
  startSprint,
  submitSprintMove
} from "../src/index.ts";
import type { Puzzle } from "../src/index.ts";

const NOW = "2026-06-20T00:00:00.000Z";

test("default sprint configs model minutes, target count, and max mistakes", () => {
  assert.deepEqual(defaultSprintConfig("standard"), {
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    targetCorrect: 15,
    maxMistakes: 3,
    ratingKey: "standard 5/20"
  });
  assert.equal(defaultSprintConfig("blitz").targetCorrect, 30);
  assert.equal(defaultSprintConfig("arrow_duel").targetCorrect, 10);
});

test("a multi-step solved puzzle can win a target-one sprint and raise ELO", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 600,
    now: NOW
  });

  let result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:05.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.attempt, undefined);

  result = submitSprintMove(result.state, "b3c1", "2026-06-20T00:00:10.000Z");
  assert.equal(result.state.status, "active");

  result = submitSprintMove(result.state, "h6c1", "2026-06-20T00:00:15.000Z");
  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.currentStreak, 1);
  assert.equal(result.state.bestStreak, 1);
  assert.equal(result.state.ratingAfter, 775);
  assert.ok((result.state.ratingDeviationAfter ?? 0) < 350);
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.attempt?.mode, "standard");
  assert.equal(result.attempt?.ratingKey, "standard 5/20");
  assert.equal(result.attempt?.ratingBefore, 600);
  assert.equal(result.attempt?.submittedMove, "h6c1");
  assert.equal(result.attempt?.expectedMove, "h6c1");
});

test("sprint streak tracks consecutive solved puzzles and resets on mistakes", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2"), oneMovePuzzle("p3"), oneMovePuzzle("p4")],
    ratingBefore: 900,
    now: NOW
  });

  let result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:01.000Z");
  assert.equal(result.state.currentStreak, 0);
  assert.equal(result.state.bestStreak, 0);
  state = result.state;

  result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.currentStreak, 1);
  assert.equal(result.state.bestStreak, 1);
  state = result.state;

  result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:03.000Z");
  assert.equal(result.state.currentStreak, 2);
  assert.equal(result.state.bestStreak, 2);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:04.000Z");
  assert.equal(result.state.currentStreak, 0);
  assert.equal(result.state.bestStreak, 2);
});

test("three wrong puzzles fail the sprint and keep rating at the floor", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2"), samplePuzzle("p3"), samplePuzzle("p4")],
    ratingBefore: 600,
    now: NOW
  });

  let result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:01.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 1);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 2);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:03.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "max_mistakes");
  assert.equal(result.state.ratingAfter, 600);
});

test("a correct Arrow Duel move records the puzzle and advances to the next puzzle", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.currentPuzzle?.puzzle.id, "p2");
});

test("Arrow Duel candidate ordering is stable for one attempt and seeded by the sprint session", () => {
  const config = buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 1,
    maxMistakes: 3
  });
  const first = startSprint({
    id: "session-a",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });
  const repeated = startSprint({
    id: "session-a",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });
  const second = startSprint({
    id: "session-b",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  assert.equal(first.currentPuzzle?.kind, "arrow_duel");
  assert.equal(repeated.currentPuzzle?.kind, "arrow_duel");
  assert.equal(second.currentPuzzle?.kind, "arrow_duel");
  assert.deepEqual(first.currentPuzzle?.candidates, repeated.currentPuzzle?.candidates);
  assert.notDeepEqual(first.currentPuzzle?.candidates, second.currentPuzzle?.candidates);
});

test("Arrow Duel attempts store the displayed candidate order", () => {
  const state = startSprint({
    id: "session-b",
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  assert.equal(state.currentPuzzle?.kind, "arrow_duel");
  const result = submitSprintMove(state, state.currentPuzzle.candidates[1] as string, "2026-06-20T00:00:01.000Z");

  assert.deepEqual(result.attempt?.arrowDuelCandidateOrder, state.currentPuzzle.candidates);
});

test("a target-one correct Arrow Duel sprint completes immediately", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
});

test("exhausting the local puzzle set completes the sprint as a pass", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "puzzles_exhausted");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.ratingAfter, 775);
  assert.equal(result.attempt?.result, "correct");
});

test("expired sprint fails before accepting another move", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 1, perPuzzleSeconds: 1, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 900,
    now: NOW
  });

  const result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "time_expired");
  assert.equal(result.attempt, undefined);
});

test("paused sprint ignores moves and resumes with the remaining time preserved", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 60, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 900,
    now: NOW
  });

  const paused = pauseSprint(state, "2026-06-20T00:00:10.000Z");
  assert.equal(paused.status, "paused");
  assert.equal(paused.pausedAt, "2026-06-20T00:00:10.000Z");

  const ignored = submitSprintMove(paused, "e6e7", "2026-06-20T00:00:20.000Z");
  assert.equal(ignored.state.status, "paused");
  assert.equal(ignored.feedback, undefined);
  assert.equal(ignored.attempt, undefined);

  const resumed = resumeSprint(paused, "2026-06-20T00:00:40.000Z");
  assert.equal(resumed.status, "active");
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(resumed.totalPausedMs, 30000);
  assert.equal(resumed.deadlineAt, "2026-06-20T00:01:30.000Z");

  const accepted = submitSprintMove(resumed, "e6e7", "2026-06-20T00:01:05.000Z");
  assert.equal(accepted.state.status, "active");
  assert.equal(accepted.feedback?.result, "correct");
});

test("per-puzzle pace does not reject correct moves before the sprint deadline", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 1,
      targetCorrect: 1,
      maxMistakes: 2
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 900,
    now: NOW
  });

  let result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:10.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.feedback?.submittedMove, "e6e7");
  assert.equal(result.feedback?.puzzleSolved, false);
  assert.equal(result.attempt, undefined);
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 0);

  result = submitSprintMove(result.state, "b3c1", "2026-06-20T00:00:20.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 0);

  result = submitSprintMove(result.state, "h6c1", "2026-06-20T00:00:30.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.feedback?.submittedMove, "h6c1");
  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
});

test("abandonSprint and serializeSprintView expose stable frontend-independent state", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 800,
    now: NOW
  });

  const view = serializeSprintView(state) as {
    status: string;
    ratingBefore: number;
    bestStreak: number;
    hasUserSubmittedMove: boolean;
    currentPuzzle: { puzzleId: string; playedMoves: string[] };
  };
  assert.equal(view.status, "active");
  assert.equal(view.ratingBefore, 800);
  assert.equal(view.bestStreak, 0);
  assert.equal(view.hasUserSubmittedMove, false);
  assert.equal(view.currentPuzzle.puzzleId, "00008");
  assert.deepEqual(view.currentPuzzle.playedMoves, ["f2g3"]);

  const abandoned = abandonSprint(state, "2026-06-20T00:00:05.000Z");
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.endReason, "abandoned");
  assert.equal(abandoned.ratingAfter, undefined);
  assert.equal(abandoned.currentPuzzle, undefined);
});

test("abandonSprint rates a failed run after the first correct move in an unfinished puzzle", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 2 }),
    puzzles: [samplePuzzle("00008"), samplePuzzle("00009")],
    ratingBefore: 800,
    now: NOW
  });

  const firstMove = submitSprintMove(state, "e6e7", "2026-06-20T00:00:05.000Z");
  assert.equal(firstMove.feedback?.result, "correct");
  assert.equal(firstMove.feedback?.puzzleSolved, false);
  assert.equal(firstMove.attempt, undefined);
  assert.equal(firstMove.state.correctCount, 0);
  assert.equal(firstMove.state.hasUserSubmittedMove, true);

  const abandoned = abandonSprint(firstMove.state, "2026-06-20T00:00:06.000Z");
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.ok(abandoned.ratingAfter !== undefined);
  assert.ok(abandoned.ratingAfter < abandoned.ratingBefore);
});

test("abandonSprint rates a failed run after the first wrong move", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 2 }),
    puzzles: [samplePuzzle("00008"), samplePuzzle("00009")],
    ratingBefore: 800,
    now: NOW
  });

  const firstMove = submitSprintMove(state, "e6d6", "2026-06-20T00:00:05.000Z");
  assert.equal(firstMove.feedback?.result, "wrong");
  assert.equal(firstMove.state.mistakeCount, 1);
  assert.equal(firstMove.state.hasUserSubmittedMove, true);

  const abandoned = abandonSprint(firstMove.state, "2026-06-20T00:00:06.000Z");
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.ok(abandoned.ratingAfter !== undefined);
  assert.ok(abandoned.ratingAfter < abandoned.ratingBefore);
});

function samplePuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 1798,
    themes: ["crushing", "hangingPiece", "long", "middlegame"],
    source: "lichess",
    stockfishBestMove: "b2b1"
  };
}

function oneMovePuzzle(id: string): Puzzle {
  return {
    ...samplePuzzle(id),
    solutionMoves: ["f2g3", "e6e7"]
  };
}
