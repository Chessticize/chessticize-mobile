import test from "node:test";
import assert from "node:assert/strict";
import {
  buildServerEloPuzzleSelectionStrategies,
  isServerCompatibleArrowDuelPuzzle
} from "../src/index.ts";
import type { Puzzle } from "../src/index.ts";

test("server-compatible puzzle selection keeps themed fallback inside the requested theme", () => {
  assert.deepEqual(buildServerEloPuzzleSelectionStrategies({ rating: 1500, themes: ["fork"] }), [
    { name: "preferred", minRating: 1400, maxRating: 1600, themes: ["fork"] },
    { name: "wider", minRating: 1300, maxRating: 1700, themes: ["fork"] },
    { name: "much_wider", minRating: 1100, maxRating: 1900, themes: ["fork"] },
    { name: "very_wide", minRating: 900, maxRating: 2100, themes: ["fork"] },
    { name: "themed_full_range", minRating: 600, maxRating: 2200, themes: ["fork"] }
  ]);
});

test("server-compatible puzzle selection mirrors low-rating floor and unthemed fallback order", () => {
  assert.deepEqual(buildServerEloPuzzleSelectionStrategies({ rating: 600 }).slice(0, 5), [
    { name: "preferred", minRating: 600, maxRating: 700, themes: [] },
    { name: "wider", minRating: 600, maxRating: 800, themes: [] },
    { name: "much_wider", minRating: 600, maxRating: 1000, themes: [] },
    { name: "very_wide", minRating: 600, maxRating: 1200, themes: [] },
    { name: "no_themes_preferred", minRating: 600, maxRating: 700, themes: [] }
  ]);

  assert.deepEqual(buildServerEloPuzzleSelectionStrategies({ rating: 600 }).at(-1), {
    name: "fallback",
    minRating: 600,
    maxRating: 2200,
    themes: []
  });
});

test("Arrow Duel eligibility mirrors server eval thresholds and requires same-side legal candidates", () => {
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "valid-black",
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      solutionMoves: ["d7d5"],
      stockfishBestMove: "e7e5",
      stockfishEval: 50,
      stockfishEvalAfterFirstMove: 300
    })),
    true
  );
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "valid-white",
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      solutionMoves: ["d2d4"],
      stockfishBestMove: "e2e4",
      stockfishEval: -50,
      stockfishEvalAfterFirstMove: -300
    })),
    true
  );
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "best-too-bad",
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      solutionMoves: ["d7d5"],
      stockfishBestMove: "e7e5",
      stockfishEval: 80,
      stockfishEvalAfterFirstMove: 300
    })),
    false
  );
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "diff-too-small",
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      solutionMoves: ["d2d4"],
      stockfishBestMove: "e2e4",
      stockfishEval: -50,
      stockfishEvalAfterFirstMove: -150
    })),
    false
  );
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "wrong-side-best-move",
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      solutionMoves: ["d7d5"],
      stockfishBestMove: "e2e4",
      stockfishEval: 50,
      stockfishEvalAfterFirstMove: 300
    })),
    false
  );
  assert.equal(
    isServerCompatibleArrowDuelPuzzle(arrowPuzzle({
      id: "forced",
      initialFen: "k7/8/K7/8/8/8/8/8 b - - 0 1",
      solutionMoves: ["a8b8"],
      stockfishBestMove: "a8b7",
      stockfishEval: 50,
      stockfishEvalAfterFirstMove: 300
    })),
    false
  );
});

function arrowPuzzle(overrides: Partial<Puzzle> & Pick<Puzzle, "id" | "initialFen" | "solutionMoves">): Puzzle {
  const puzzle: Puzzle = {
    id: overrides.id,
    initialFen: overrides.initialFen,
    solutionMoves: overrides.solutionMoves,
    rating: 1500,
    themes: ["tactics"],
    source: "lichess"
  };
  if (overrides.stockfishBestMove !== undefined) {
    puzzle.stockfishBestMove = overrides.stockfishBestMove;
  }
  if (overrides.stockfishEval !== undefined) {
    puzzle.stockfishEval = overrides.stockfishEval;
  }
  if (overrides.stockfishEvalAfterFirstMove !== undefined) {
    puzzle.stockfishEvalAfterFirstMove = overrides.stockfishEvalAfterFirstMove;
  }
  return puzzle;
}
