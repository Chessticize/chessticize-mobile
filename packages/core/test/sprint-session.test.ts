import test from "node:test";
import assert from "node:assert/strict";
import {
  abandonSprint,
  buildSprintConfig,
  defaultSprintConfig,
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
  assert.ok((result.state.ratingAfter ?? 0) > 600);
  assert.equal(result.attempt?.result, "correct");
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

  let result = submitSprintMove(state, "e6e8", "2026-06-20T00:00:01.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 1);
  state = result.state;

  result = submitSprintMove(state, "e6e8", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 2);
  state = result.state;

  result = submitSprintMove(state, "e6e8", "2026-06-20T00:00:03.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "max_mistakes");
  assert.equal(result.state.ratingAfter, 600);
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

test("per-puzzle timeout counts as a wrong attempt and advances or fails by mistake limit", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 1,
      targetCorrect: 3,
      maxMistakes: 2
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2"), samplePuzzle("p3")],
    ratingBefore: 900,
    now: NOW
  });

  let result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:02.000Z");
  assert.equal(result.feedback?.result, "wrong");
  assert.equal(result.feedback?.submittedMove, "__timeout__");
  assert.equal(result.attempt?.submittedMove, "__timeout__");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 1);
  assert.equal(result.state.currentPuzzle?.puzzle.id, "p2");

  result = submitSprintMove(result.state, "e6e7", "2026-06-20T00:00:04.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "max_mistakes");
  assert.equal(result.state.mistakeCount, 2);
});

test("abandonSprint and serializeSprintView expose stable frontend-independent state", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 750,
    now: NOW
  });

  const view = serializeSprintView(state) as {
    status: string;
    ratingBefore: number;
    currentPuzzle: { puzzleId: string; playedMoves: string[] };
  };
  assert.equal(view.status, "active");
  assert.equal(view.ratingBefore, 750);
  assert.equal(view.currentPuzzle.puzzleId, "00008");
  assert.deepEqual(view.currentPuzzle.playedMoves, ["f2g3"]);

  const abandoned = abandonSprint(state, "2026-06-20T00:00:05.000Z");
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.equal(abandoned.currentPuzzle, undefined);
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
