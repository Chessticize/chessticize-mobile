import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Chess } from "chess.js";
import {
  analyzeFenWithUciEngine,
  applyMovesToFen,
  beginLinePuzzle,
  buildArrowDuelCandidateAnalysisLines,
  buildPuzzleGuidedAnalysisLines,
  parseStockfishInfoLine
} from "../src/index.ts";
import type { EngineAnalysisLine, Puzzle, UciEngineTransport } from "../src/index.ts";

test("parses Stockfish mate scores from side-to-move and white perspectives", () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const line = parseStockfishInfoLine("info depth 12 multipv 1 score mate 1 pv c2b1", fen);

  assert.ok(line);
  assert.equal(line.move, "c2b1");
  assert.deepEqual(line.score, {
    kind: "mate",
    sideToMoveMate: 1,
    whiteMate: 1
  });
});

test("parses black-to-move centipawn scores without displaying the white-perspective sign as side score", () => {
  const fen = samplePuzzle("00008").initialFen;
  const line = parseStockfishInfoLine("info depth 12 multipv 1 score cp 453 pv b2b1", fen);

  assert.ok(line);
  assert.equal(line.score.kind, "cp");
  assert.equal(line.score.sideToMoveCentipawns, 453);
  assert.equal(line.score.whiteCentipawns, -453);
});

test("analyzes UCI output through a maintained fake transport", async () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const engine = new FakeUciEngine([
    "info depth 8 multipv 1 score mate 1 pv c2b1",
    "info depth 8 multipv 2 score cp 210 pv c2a4",
    "bestmove c2b1"
  ]);

  const lines = await analyzeFenWithUciEngine(engine, fen, { depth: 8, multiPv: 2, timeoutMs: 1000 });

  assert.deepEqual(engine.commands, [
    "uci",
    "isready",
    "setoption name MultiPV value 2",
    "ucinewgame",
    "stop",
    `position fen ${fen}`,
    "go depth 8"
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.move, "c2b1");
  assert.equal(lines[0]?.score.kind, "mate");
});

test("can analyze against an already warmed UCI engine without repeating initialization", async () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const engine = new FakeUciEngine([
    "info depth 8 multipv 1 score mate 1 pv c2b1",
    "bestmove c2b1"
  ]);

  const lines = await analyzeFenWithUciEngine(engine, fen, {
    depth: 8,
    initialize: false,
    multiPv: 1,
    newGame: false,
    timeoutMs: 1000
  });

  assert.deepEqual(engine.commands, [
    "stop",
    `position fen ${fen}`,
    "go depth 8"
  ]);
  assert.equal(lines[0]?.move, "c2b1");
  assert.equal(lines[0]?.score.kind, "mate");
});

test("streams Stockfish MultiPV updates before the final bestmove", async () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const engine = new FakeUciEngine([
    "info depth 3 multipv 1 score cp 120 pv c2a4",
    "info depth 3 multipv 2 score cp 80 pv c2b1",
    "info depth 7 multipv 1 score mate 1 pv c2b1",
    "bestmove c2b1"
  ]);
  const updates: EngineAnalysisLine[][] = [];

  const lines = await analyzeFenWithUciEngine(engine, fen, {
    depth: 8,
    multiPv: 2,
    timeoutMs: 1000,
    onUpdate: (nextLines) => updates.push(nextLines)
  });

  assert.ok(updates.length >= 3);
  assert.equal(updates[0]?.[0]?.move, "c2a4");
  assert.equal(updates[0]?.[0]?.depth, 3);
  assert.equal(updates.at(-1)?.[0]?.move, "c2b1");
  assert.equal(updates.at(-1)?.[0]?.depth, 7);
  assert.equal(lines[0]?.move, "c2b1");
});

test("starts with shallow analysis and then continues to the requested depth", async () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const engine = new StagedFakeUciEngine({
    "go depth 4": [
      "info depth 4 multipv 1 score cp 120 pv c2a4",
      "bestmove c2a4"
    ],
    "go depth 10": [
      "info depth 10 multipv 1 score mate 1 pv c2b1",
      "bestmove c2b1"
    ]
  });
  const updates: EngineAnalysisLine[][] = [];

  const lines = await analyzeFenWithUciEngine(engine, fen, {
    depth: 10,
    shallowDepth: 4,
    shallowDelayMs: 0,
    multiPv: 1,
    timeoutMs: 1000,
    onUpdate: (nextLines) => updates.push(nextLines)
  });

  assert.deepEqual(engine.commands, [
    "uci",
    "isready",
    "setoption name MultiPV value 1",
    "ucinewgame",
    "stop",
    `position fen ${fen}`,
    "go depth 4",
    "stop",
    "go depth 10"
  ]);
  assert.equal(updates[0]?.[0]?.depth, 4);
  assert.equal(updates.at(-1)?.[0]?.depth, 10);
  assert.equal(lines[0]?.move, "c2b1");
  assert.equal(lines[0]?.depth, 10);
});

test("shows legal mate-in-one as M1 even when no engine output is available", () => {
  const fen = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";
  const lines = buildPuzzleGuidedAnalysisLines({
    fen,
    puzzle: {
      id: "mate-alt",
      initialFen: fen,
      solutionMoves: ["c2a4"],
      rating: 600,
      themes: ["mate"],
      source: "synthetic",
      stockfishBestMove: "c2a4"
    }
  });

  assert.equal(lines[0]?.move, "c2a4");
  assert.equal(lines[0]?.score, "M1");
});

test("formats presolved black best move eval from the side-to-move perspective", () => {
  const puzzle = samplePuzzle("00008");
  const lines = buildPuzzleGuidedAnalysisLines({
    fen: puzzle.initialFen,
    puzzle
  });

  assert.equal(lines[0]?.move, "b2b1");
  assert.equal(lines[0]?.score, "+4.5");
});

test("formats Arrow Duel candidate evals from presolved best and blunder scores", () => {
  const puzzle = samplePuzzle("00008");
  const lines = buildArrowDuelCandidateAnalysisLines({ puzzle });

  assert.equal(lines[0]?.move, "b2b1");
  assert.equal(lines[0]?.san, "Qb1+");
  assert.equal(lines[0]?.label, "Top move");
  assert.equal(lines[0]?.score, "+4.5");
  assert.equal(lines[1]?.move, "f2g3");
  assert.equal(lines[1]?.label, "Candidate");
  assert.equal(lines[1]?.score, "-6.9");
});

test("keeps the puzzle move highest only on the puzzle solver side", () => {
  const puzzle = blackToMovePuzzle();
  const initialLines = buildPuzzleGuidedAnalysisLines({
    fen: puzzle.initialFen,
    puzzle,
    engineLines: [
      {
        move: "e2e4",
        pv: ["e2e4"],
        multipv: 1,
        depth: 12,
        score: { kind: "cp", sideToMoveCentipawns: 120, whiteCentipawns: 120 }
      }
    ]
  });

  assert.equal(new Chess(puzzle.initialFen).turn(), "w");
  assert.equal(initialLines[0]?.move, "e2e4");

  const blackToMoveFen = applyMovesToFen(puzzle.initialFen, ["g2g4"]);
  const blackLines = buildPuzzleGuidedAnalysisLines({
    fen: blackToMoveFen,
    puzzle,
    engineLines: [
      {
        move: "b8c6",
        pv: ["b8c6"],
        multipv: 1,
        depth: 12,
        score: { kind: "cp", sideToMoveCentipawns: 250, whiteCentipawns: -250 }
      }
    ]
  });

  assert.equal(new Chess(blackToMoveFen).turn(), "b");
  assert.equal(blackLines[0]?.move, "d8h4");
  assert.equal(blackLines[0]?.score, "M1");
});

test("uses current puzzle state as the direct guided move during a review line", () => {
  const puzzle = samplePuzzle("00008");
  const state = beginLinePuzzle(puzzle);
  const lines = buildPuzzleGuidedAnalysisLines({
    fen: state.currentFen,
    puzzle,
    currentPuzzle: state
  });

  assert.equal(lines[0]?.move, "e6e7");
  assert.equal(lines[0]?.score, "+6.9");
});

test("does not pad live engine analysis with unscored legal moves", () => {
  const puzzle = samplePuzzle("00008");
  const lines = buildPuzzleGuidedAnalysisLines({
    fen: puzzle.initialFen,
    puzzle,
    engineLines: [
      {
        move: "b2b1",
        pv: ["b2b1"],
        multipv: 1,
        depth: 12,
        score: { kind: "cp", sideToMoveCentipawns: 453, whiteCentipawns: -453 }
      }
    ],
    includeUnscoredLegalMoves: false
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.move, "b2b1");
  assert.equal(lines[0]?.score, "+4.5");
});

test("offline puzzles put the expected move first only on the puzzle solver side", () => {
  for (const puzzle of loadOfflinePuzzles()) {
    const solverColor = puzzleSolverColor(puzzle);
    let fen = puzzle.initialFen;

    for (let cursor = 0; cursor < puzzle.solutionMoves.length; cursor += 1) {
      const expectedMove = puzzle.solutionMoves[cursor];
      if (!expectedMove) {
        break;
      }

      if (new Chess(fen).turn() === solverColor) {
        const lines = buildPuzzleGuidedAnalysisLines({ fen, puzzle });
        assert.equal(
          lines[0]?.move,
          expectedMove.toLowerCase(),
          `puzzle ${puzzle.id} cursor ${cursor} should keep ${expectedMove} first for ${solverColor}`
        );
      }

      fen = applyMovesToFen(fen, [expectedMove]);
    }
  }
});

class FakeUciEngine implements UciEngineTransport {
  readonly commands: string[] = [];
  private listener: ((line: string) => void) | null = null;
  private readonly lines: string[];

  constructor(lines: string[]) {
    this.lines = lines;
  }

  async start(): Promise<void> {}

  send(command: string): void {
    this.commands.push(command);
    if (command.startsWith("go ")) {
      queueMicrotask(() => {
        for (const line of this.lines) {
          this.listener?.(line);
        }
      });
    }
  }

  onLine(listener: (line: string) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  terminate(): void {}
}

class StagedFakeUciEngine implements UciEngineTransport {
  readonly commands: string[] = [];
  private listener: ((line: string) => void) | null = null;
  private readonly linesByGoCommand: Record<string, string[]>;

  constructor(linesByGoCommand: Record<string, string[]>) {
    this.linesByGoCommand = linesByGoCommand;
  }

  async start(): Promise<void> {}

  send(command: string): void {
    this.commands.push(command);
    const lines = this.linesByGoCommand[command];
    if (lines) {
      queueMicrotask(() => {
        for (const line of lines) {
          this.listener?.(line);
        }
      });
    }
  }

  onLine(listener: (line: string) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  terminate(): void {}
}

function samplePuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 1798,
    themes: ["crushing", "hangingPiece", "long", "middlegame"],
    source: "lichess",
    stockfishEval: -453,
    stockfishBestMove: "b2b1",
    stockfishEvalAfterFirstMove: 693
  };
}

function blackToMovePuzzle(): Puzzle {
  return {
    id: "black-mate-guided",
    initialFen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    solutionMoves: ["g2g4", "d8h4"],
    rating: 600,
    themes: ["mate", "mateIn1"],
    source: "synthetic",
    stockfishBestMove: "e2e4"
  };
}

function loadOfflinePuzzles(): Puzzle[] {
  return JSON.parse(readFileSync(resolve("fixtures/puzzles/presolved-1000.json"), "utf8")) as Puzzle[];
}

function puzzleSolverColor(puzzle: Puzzle): "w" | "b" {
  const afterFirstMove = puzzle.solutionMoves[0] ? applyMovesToFen(puzzle.initialFen, [puzzle.solutionMoves[0]]) : puzzle.initialFen;
  return new Chess(afterFirstMove).turn();
}
