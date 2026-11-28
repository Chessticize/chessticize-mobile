import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  auditGameResult,
  formatMarkdownReport,
  runQualityBenchmark
} from "./benchmark-game-review-quality.mjs";

test("deterministic quality benchmark passes all corpus and per-game invariants within CI budget", async () => {
  const startedAt = performance.now();
  const report = await runQualityBenchmark({ mode: "deterministic" });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(
    report.summary.allPassed,
    true,
    `Deterministic quality benchmark failed:\n${report.failures.join("\n")}`
  );
  assert.equal(report.summary.invariantsFailed, 0);
  assert.ok(report.gameCount >= 8, `Expected at least 8 corpus games, got ${report.gameCount}`);
  assert.ok(report.summary.totalPuzzles > 0, "Expected extracted puzzles across corpus");
  assert.ok(report.summary.arrowDuelCount > 0, "Expected at least 1 Arrow Duel puzzle");
  assert.ok(report.summary.lineCount > 0, "Expected at least 1 Line puzzle");
  assert.ok(report.summary.totalHighlights > 0, "Expected at least 1 opponent-caught highlight");
  assert.ok(elapsedMs < 2000, `Expected deterministic benchmark < 2000ms, took ${elapsedMs.toFixed(1)}ms`);

  const preEvalGame = report.games.find((game) => game.preEvaluated);
  assert.ok(preEvalGame, "Expected a pre-evaluated Lichess game in corpus");
  assert.equal(preEvalGame.pass1EngineCalls, 0);

  const markdown = formatMarkdownReport(report);
  assert.match(markdown, /# Game Review Quality & Performance Benchmark \(deterministic\)/);
  assert.match(markdown, /\| Game \| Class \| Plies \| Pass-1 ms \| Pass-2 ms \|/);
  assert.doesNotMatch(markdown, /\| FAIL \|/);
});

test("CLI deterministic benchmark exits 0 and emits valid JSON report", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/benchmark-game-review-quality.mjs",
      "--mode=deterministic",
      "--json"
    ],
    { encoding: "utf8" }
  );
  const report = JSON.parse(output);
  assert.equal(report.mode, "deterministic");
  assert.equal(report.summary.allPassed, true);
  assert.equal(report.summary.invariantsFailed, 0);
});

test("auditGameResult catches garbage-time leaks, opponent_caught leaks, Arrow Duel violations, and cap overflow", () => {
  const baseGameSpec = {
    id: "synthetic-regression-check",
    userColor: "w",
    expected: {}
  };
  const baseReport = {
    isComplete: true,
    parsedGame: {
      white: "Hero",
      black: "Rival",
      timeClass: "blitz"
    },
    plies: []
  };
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const badPuzzles = [
    // Garbage-time leak (prevCp > 300 without mate) + opponent_blunder_caught leak
    {
      idSeed: "bad-1",
      ply: 5,
      moveNumber: 3,
      puzzleKind: "line",
      momentKind: "opponent_blunder_caught",
      userColor: "w",
      puzzleColor: "w",
      initialFen: startFen,
      solutionMoves: ["e2e4", "e7e5"],
      prevCp: 450,
      cp: 500,
      winChanceSwing: 0.45,
      themes: ["fork"],
      lengthTag: "oneMove",
      phaseTag: "opening",
      caliberScore: 80
    },
    // Arrow Duel same-move + empty punishmentLine violation
    {
      idSeed: "bad-2",
      ply: 7,
      moveNumber: 4,
      puzzleKind: "arrow_duel",
      momentKind: "own_blunder_punished",
      userColor: "w",
      puzzleColor: "w",
      initialFen: startFen,
      solutionMoves: ["e2e4"],
      prevCp: 0,
      cp: 350,
      winChanceSwing: 0.5,
      arrowDuel: {
        bestMove: "e2e4",
        blunderMove: "e2e4",
        bestEvalWhite: 20,
        blunderEvalWhite: -400,
        punishmentLine: [],
        decisionFen: startFen
      },
      themes: ["hangingPiece"],
      lengthTag: "oneMove",
      phaseTag: "opening",
      caliberScore: 90
    }
  ];

  const audit = auditGameResult(
    baseGameSpec,
    {
      report: baseReport,
      puzzles: badPuzzles,
      highlights: [],
      allCandidatePuzzles: badPuzzles
    },
    0,
    1
  );

  assert.equal(audit.passed, false);
  const joined = audit.failures.join("\n");
  assert.match(joined, /exceeding maxPuzzlesPerGame=1/);
  assert.match(joined, /opponent_\*_caught moment/);
  assert.match(joined, /Garbage-time leak/);
  assert.match(joined, /bestMove === blunderMove/);
  assert.match(joined, /missing non-empty punishmentLine/);
});
