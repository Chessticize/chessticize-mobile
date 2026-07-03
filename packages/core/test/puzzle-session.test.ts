import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Chess } from "chess.js";
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
  const result = submitLineMove(state, "e6d6");

  assert.equal(result.feedback.result, "wrong");
  assert.equal(result.feedback.expectedMove, "e6e7");
  assert.equal(result.state.cursor, 1);
  assert.deepEqual(result.state.playedMoves, ["f2g3"]);
});

test("line puzzle rejects illegal moves instead of recording them as wrong attempts", () => {
  const state = beginLinePuzzle(samplePuzzle("00008"));

  assert.throws(
    () => submitLineMove(state, "a1a8"),
    /not legal in the current position/
  );
  assert.equal(state.cursor, 1);
  assert.deepEqual(state.playedMoves, ["f2g3"]);
});

test("line puzzle accepts any legal checkmate even when it is not the official move", () => {
  const result = submitLineMove({
    kind: "line",
    puzzle: {
      ...samplePuzzle("mate-alt"),
      initialFen: "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1",
      solutionMoves: ["c2a4"]
    },
    currentFen: "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1",
    playedMoves: [],
    cursor: 0,
    autoPlayedMoves: [],
    solved: false
  }, "c2b1");

  assert.equal(result.feedback.result, "correct");
  assert.equal(result.feedback.puzzleSolved, true);
  assert.equal(result.feedback.expectedMove, "c2a4");
  assert.equal(result.feedback.submittedMove, "c2b1");
  assert.equal(result.state.solved, true);
  assert.deepEqual(result.state.playedMoves, ["c2b1"]);
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

test("Arrow Duel can replay a persisted candidate order", () => {
  const state = beginArrowDuelPuzzle(samplePuzzle("00008"), { candidateOrder: ["f2g3", "b2b1"] });

  assert.deepEqual(state.candidates, ["f2g3", "b2b1"]);
  assert.equal(state.correctMove, "b2b1");
  assert.equal(state.wrongMove, "f2g3");
});

test("Arrow Duel rejects a persisted candidate order that does not match the puzzle", () => {
  assert.throws(
    () => beginArrowDuelPuzzle(samplePuzzle("00008"), { candidateOrder: ["f2g3", "a1a8"] }),
    /does not match its candidate moves/
  );
});

test("Arrow Duel rejects moves outside the displayed candidates without creating feedback", () => {
  const state = beginArrowDuelPuzzle(samplePuzzle("00008"));

  assert.throws(
    () => submitArrowDuelChoice(state, "a1a8"),
    /not one of the Arrow Duel candidates/
  );
  assert.equal(state.selectedMove, undefined);
  assert.equal(state.solved, false);
});

test("offline regression sample manifest points at stable Standard puzzle shapes", () => {
  const puzzles = loadOfflinePuzzles();
  const samples = loadRegressionSamples();
  const puzzleById = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));

  assert.deepEqual(samples.map((sample) => sample.id), ["00008", "00ueM", "00DkJ", "00LSv", "000hf"]);

  for (const sample of samples) {
    assert.ok(puzzleById.has(sample.id), `sample puzzle ${sample.id} must exist in the offline fixture`);
  }

  const multiMove = requiredPuzzle(puzzleById, "00008");
  assert.ok(userMoveCount(multiMove) >= 3);
  assert.equal(beginLinePuzzle(multiMove).cursor, 1);

  const promotion = requiredPuzzle(puzzleById, "00ueM");
  assert.ok(promotion.themes.includes("promotion"));
  assert.ok(promotion.solutionMoves.some((move) => move.length > 4));
  assert.equal(solveLinePuzzle(promotion).submittedPromotionMove, true);

  const initialCheck = requiredPuzzle(puzzleById, "00DkJ");
  assert.equal(new Chess(initialCheck.initialFen).isCheck(), true);

  const userTurnCheck = requiredPuzzle(puzzleById, "00LSv");
  assert.equal(new Chess(beginLinePuzzle(userTurnCheck).currentFen).isCheck(), true);

  const shortMate = requiredPuzzle(puzzleById, "000hf");
  assert.ok(shortMate.themes.includes("mate"));
  assert.ok(shortMate.themes.includes("short"));
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

function loadOfflinePuzzles(): Puzzle[] {
  return JSON.parse(readFileSync(resolve("fixtures/puzzles/presolved-1000.json"), "utf8")) as Puzzle[];
}

function loadRegressionSamples(): Array<{ id: string; label: string; notes: string }> {
  const manifest = JSON.parse(readFileSync(resolve("fixtures/puzzles/regression-samples.json"), "utf8")) as {
    samples: Array<{ id: string; label: string; notes: string }>;
  };
  return manifest.samples;
}

function requiredPuzzle(puzzleById: Map<string, Puzzle>, id: string): Puzzle {
  const puzzle = puzzleById.get(id);
  if (!puzzle) {
    throw new Error(`Missing sample puzzle ${id}`);
  }
  return puzzle;
}

function userMoveCount(puzzle: Puzzle): number {
  return puzzle.solutionMoves.filter((_, index) => index % 2 === 1).length;
}

function solveLinePuzzle(puzzle: Puzzle): { submittedPromotionMove: boolean } {
  let state = beginLinePuzzle(puzzle);
  let submittedPromotionMove = false;
  while (!state.solved) {
    const move = currentExpectedMove(state);
    if (!move) {
      throw new Error(`Puzzle ${puzzle.id} has no expected move at cursor ${state.cursor}`);
    }
    submittedPromotionMove = submittedPromotionMove || move.length > 4;
    state = submitLineMove(state, move).state;
  }
  return { submittedPromotionMove };
}
