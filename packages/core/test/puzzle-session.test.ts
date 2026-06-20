import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMovesToFen,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  currentExpectedMove,
  submitArrowDuelChoice,
  submitLineMove
} from "../src/index.ts";
import type { Puzzle } from "../src/index.ts";

test("line puzzle starts after the Lichess first auto move and supports multi-step solutions", () => {
  let state = beginLinePuzzle(samplePuzzle("00008"));

  assert.equal(state.cursor, 1);
  assert.equal(currentExpectedMove(state), "e6e7");
  assert.deepEqual(state.playedMoves, ["f2g3"]);
  assert.deepEqual(state.autoPlayedMoves, ["f2g3"]);
  assert.equal(state.solved, false);

  let result = submitLineMove(state, "e6e7");
  assert.equal(result.feedback.result, "correct");
  assert.equal(result.feedback.puzzleSolved, false);
  assert.deepEqual(result.feedback.autoPlayedMoves, ["b2b1"]);
  state = result.state;
  assert.deepEqual(state.playedMoves, ["f2g3", "e6e7", "b2b1"]);
  assert.equal(state.cursor, 3);

  result = submitLineMove(state, "b3c1");
  assert.equal(result.feedback.result, "correct");
  assert.deepEqual(result.feedback.autoPlayedMoves, ["b1c1"]);
  state = result.state;

  result = submitLineMove(state, "h6c1");
  assert.equal(result.feedback.result, "correct");
  assert.equal(result.feedback.puzzleSolved, true);
  assert.equal(result.state.solved, true);
  assert.deepEqual(result.state.playedMoves, ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"]);
});

test("applyMovesToFen can replay UCI moves for board adapters", () => {
  const puzzle = samplePuzzle("00008");
  const afterFirstMove = applyMovesToFen(puzzle.initialFen, ["f2g3"]);
  const lineState = beginLinePuzzle(puzzle);

  assert.equal(afterFirstMove, lineState.currentFen);
});

test("line puzzle rejects a wrong move without advancing state", () => {
  const state = beginLinePuzzle(samplePuzzle("00008"));
  const result = submitLineMove(state, "e6e8");

  assert.equal(result.feedback.result, "wrong");
  assert.equal(result.feedback.expectedMove, "e6e7");
  assert.equal(result.state.cursor, 1);
  assert.deepEqual(result.state.playedMoves, ["f2g3"]);
});

test("Arrow Duel exposes two candidates and marks review arrows after a wrong choice", () => {
  const state = beginArrowDuelPuzzle(samplePuzzle("00008"));

  assert.deepEqual(state.candidates, ["b2b1", "f2g3"]);

  const result = submitArrowDuelChoice(state, "f2g3");
  assert.equal(result.feedback.result, "wrong");
  assert.equal(result.feedback.expectedMove, "b2b1");
  assert.deepEqual(result.feedback.review?.punishmentLine, ["f2g3", "e6e7"]);
  assert.deepEqual(result.feedback.review?.arrows, [
    { move: "b2b1", role: "correct", color: "green", selected: false },
    { move: "f2g3", role: "wrong", color: "red", selected: true }
  ]);
});

test("Arrow Duel rejects moves outside the displayed candidates", () => {
  const state = beginArrowDuelPuzzle(samplePuzzle("00008"));

  const result = submitArrowDuelChoice(state, "a1a8");
  assert.equal(result.feedback.result, "wrong");
  assert.equal(result.feedback.puzzleSolved, false);
  assert.equal(result.feedback.expectedMove, state.correctMove);
  assert.deepEqual(result.state.selectedMove, "a1a8");
  assert.deepEqual(result.feedback.review?.arrows, [
    { move: "b2b1", role: "correct", color: "green", selected: false },
    { move: "f2g3", role: "wrong", color: "red", selected: false }
  ]);
});

function samplePuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 1798,
    themes: ["crushing", "hangingPiece", "long", "middlegame"],
    gameUrl: "https://lichess.org/787zsVup/black#48",
    openingTags: [],
    source: "lichess",
    stockfishEval: -453,
    stockfishBestMove: "b2b1",
    stockfishEvalAfterFirstMove: 693
  };
}
