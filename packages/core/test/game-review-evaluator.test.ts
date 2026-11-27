import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import type { AnalysisScore, EngineAnalysisLine } from "../src/engine-analysis.ts";
import {
  classifyClockBucket,
  classifyMove,
  computeMoveAccuracy,
  computeSideAccuracy,
  evaluateGamePass1,
  isKeyMomentCandidatePly,
  normalizeTimeClass,
  parseClockComment,
  parseEvalComment,
  parsePgnGame,
  parsePgnGames,
  scoreToCentipawns,
  winChances,
  winPercent,
  type GamePlyEvaluation,
  type GameReviewEngine,
  type GameReviewEngineRequest
} from "../src/game-review/index.ts";

function cpScore(whiteCp: number, sideToMove: "w" | "b" = "w"): AnalysisScore {
  return {
    kind: "cp",
    whiteCentipawns: whiteCp,
    sideToMoveCentipawns: sideToMove === "w" ? whiteCp : -whiteCp
  };
}

function mateScore(whiteMate: number, sideToMove: "w" | "b" = "w"): AnalysisScore {
  const sideToMoveMate =
    whiteMate === 0
      ? Object.is(whiteMate, -0)
        ? sideToMove === "w"
          ? -0
          : 0
        : sideToMove === "w"
          ? 0
          : -0
      : sideToMove === "w"
        ? whiteMate
        : -whiteMate;
  return {
    kind: "mate",
    whiteMate,
    sideToMoveMate
  };
}

function createFakeEngine(
  byFen: Map<string, { score: AnalysisScore; bestMove?: string; secondLine?: EngineAnalysisLine }>,
  options: {
    defaultScore?: AnalysisScore;
    onAnalyze?: (request: GameReviewEngineRequest) => void;
    rejectOnAbort?: boolean;
  } = {}
): { engine: GameReviewEngine; requests: GameReviewEngineRequest[] } {
  const requests: GameReviewEngineRequest[] = [];
  const engine: GameReviewEngine = {
    async analyze(request: GameReviewEngineRequest): Promise<EngineAnalysisLine[]> {
      requests.push(request);
      options.onAnalyze?.(request);
      if (request.signal?.aborted) {
        if (options.rejectOnAbort) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }
        return [];
      }
      const entry = byFen.get(request.fen);
      const side = request.fen.split(/\s+/)[1] === "b" ? "b" : "w";
      const score = entry?.score ?? options.defaultScore ?? cpScore(0, side);
      const bestMove = entry?.bestMove ?? firstLegalUci(request.fen) ?? "0000";
      const lines: EngineAnalysisLine[] = [
        {
          move: bestMove,
          pv: [bestMove],
          multipv: 1,
          depth: request.depth ?? 12,
          score
        }
      ];
      if (entry?.secondLine) {
        lines.push(entry.secondLine);
      }
      return lines;
    }
  };
  return { engine, requests };
}

function firstLegalUci(fen: string): string | undefined {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const first = moves[0];
  return first ? `${first.from}${first.to}${first.promotion ?? ""}` : undefined;
}

// ---------------------------------------------------------------------------
// 1. Win% & Accuracy% unit tests
// ---------------------------------------------------------------------------

test("winChances and winPercent preserve symmetry and handle extreme cp & mate edge cases", () => {
  const equal = cpScore(0, "w");
  assert.equal(winChances(equal, "white"), 0);
  assert.equal(winChances(equal, "black"), 0);
  assert.equal(winPercent(equal, "white"), 50);
  assert.equal(winPercent(equal, "black"), 50);

  const plus150 = cpScore(150, "w");
  const minus150 = cpScore(-150, "w");
  assert.ok(Math.abs(winChances(plus150, "white") + winChances(minus150, "white")) < 1e-12);
  assert.ok(Math.abs(winChances(plus150, "white") + winChances(plus150, "black")) < 1e-12);
  assert.ok(Math.abs(winPercent(plus150, "white") + winPercent(plus150, "black") - 100) < 1e-12);

  // Side-to-move POV flips when Black is to move
  const blackToMoveWhiteAhead = cpScore(200, "b");
  assert.ok(winChances(blackToMoveWhiteAhead, "white") > 0);
  assert.ok(winChances(blackToMoveWhiteAhead, "sideToMove") < 0);
  assert.ok(
    Math.abs(
      winChances(blackToMoveWhiteAhead, "black") -
        winChances(blackToMoveWhiteAhead, "sideToMove")
    ) < 1e-12
  );

  // Extreme centipawns stay cleanly bounded in [-1, +1] and [0, 100]
  assert.equal(winChances(cpScore(1_000_000, "w"), "white"), 1);
  assert.equal(winChances(cpScore(-1_000_000, "w"), "white"), -1);
  assert.equal(winPercent(cpScore(1_000_000, "w"), "white"), 100);
  assert.equal(winPercent(cpScore(-1_000_000, "w"), "white"), 0);

  // Positive and negative mate
  assert.equal(winChances(mateScore(3, "w"), "white"), 1);
  assert.equal(winChances(mateScore(3, "w"), "black"), -1);
  assert.equal(winPercent(mateScore(3, "w"), "white"), 100);
  assert.equal(winPercent(mateScore(-2, "w"), "white"), 0);
  assert.equal(winPercent(mateScore(-2, "w"), "black"), 100);

  // Mate-in-0 (#0 = White delivered mate, #-0 = Black delivered mate)
  const whiteDeliveredMate = mateScore(0, "b");
  assert.equal(winChances(whiteDeliveredMate, "white"), 1);
  assert.equal(winChances(whiteDeliveredMate, "black"), -1);
  assert.equal(winChances(whiteDeliveredMate, "sideToMove"), -1);
  assert.equal(scoreToCentipawns(whiteDeliveredMate, "white"), 10000);
  assert.equal(scoreToCentipawns(whiteDeliveredMate, "black"), -10000);

  const blackDeliveredMate = mateScore(-0, "w");
  assert.equal(winChances(blackDeliveredMate, "white"), -1);
  assert.equal(winChances(blackDeliveredMate, "black"), 1);
  assert.equal(winChances(blackDeliveredMate, "sideToMove"), -1);
  assert.equal(scoreToCentipawns(blackDeliveredMate, "white", 5000), -5000);
  assert.equal(scoreToCentipawns(blackDeliveredMate, "black", 5000), 5000);
});

test("computeMoveAccuracy and computeSideAccuracy match Lichess curve and handle short/blunder games", () => {
  // Zero drop -> ~100%
  assert.ok(computeMoveAccuracy(50, 50) > 99.99);
  assert.ok(computeMoveAccuracy(50, 55) > 99.99);

  // Monotonically decreases with win% loss
  const smallLoss = computeMoveAccuracy(50, 46);
  const mediumLoss = computeMoveAccuracy(50, 35);
  const hugeLoss = computeMoveAccuracy(80, 15);
  assert.ok(smallLoss > mediumLoss && mediumLoss > hugeLoss);
  assert.ok(hugeLoss >= 0 && smallLoss <= 100);

  // Short & empty sequences handled safely without NaN
  assert.equal(computeSideAccuracy([]), 0);
  assert.equal(computeSideAccuracy([50]), 0);
  assert.ok(computeSideAccuracy([50, 50]) > 99.9);
  assert.ok(computeSideAccuracy([50, 52, 55, 60]) > 99.9);

  // Balanced clean play scores much higher than blunder-heavy play
  const cleanAcc = computeSideAccuracy([50, 49.5, 50.2, 49.8, 50.1, 50]);
  const blunderAcc = computeSideAccuracy([50, 20, 15, 3, 2, 1]);
  assert.ok(cleanAcc > 95, `expected cleanAcc > 95, got ${cleanAcc}`);
  assert.ok(blunderAcc < 65, `expected blunderAcc < 65, got ${blunderAcc}`);
});

// ---------------------------------------------------------------------------
// 2. PGN parsing, multi-game, headers, [%clk], [%eval], time class & buckets
// ---------------------------------------------------------------------------

test("parses multi-game PGNs with CRLF, Chess.com + Lichess headers, nested variations, NAGs, [%clk], and [%eval]", () => {
  const chessComGame = [
    '[Event "Live Chess"]',
    '[Site "Chess.com"]',
    '[Date "2026.03.14"]',
    '[UTCDate "2026.03.14"]',
    '[UTCTime "14:22:10"]',
    '[White "Alice"]',
    '[Black "Bob"]',
    '[WhiteElo "1640"]',
    '[BlackElo "1615"]',
    '[Result "1-0"]',
    '[TimeControl "180+2"]',
    '[ECO "C20"]',
    '[Opening "King\'s Pawn Game: Wayward Queen Attack"]',
    '[Termination "Alice won by checkmate"]',
    "",
    "1. e4 {[%clk 0:02:59.5]} 1... e5 {[%clk 0:02:58.0]} (1... c5 {Sicilian (nested (comment))} 2. Nf3 (2. Nc3))",
    "2. Qh5 $1 {[%clk 0:02:49.0]} 2... Nc6?? {[%clk 0:02:57.0]}",
    "3. Bc4 {[%clk 0:02:50.5]} 3... Nf6 {[%clk 0:00:12.0]}",
    "4. Qxf7# {[%clk 0:00:08.5]} 1-0"
  ].join("\r\n");

  const lichessGame = [
    '[Event "Rated Blitz game"]',
    '[Site "https://lichess.org/xyz98765"]',
    '[UTCDate "2026.03.15"]',
    '[UTCTime "09:10:00"]',
    '[White "Carol"]',
    '[Black "Dave"]',
    '[WhiteElo "1800"]',
    '[BlackElo "?"]',
    '[Result "0-1"]',
    '[TimeControl "60+0"]',
    '[ECO "A00"]',
    '[Opening "Barnes Opening: Fool\'s Mate"]',
    '[Termination "Normal"]',
    "",
    "1. f3 { [%eval -0.65] [%clk 0:00:59] } 1... e5 { [%eval -0.55] [%clk 0:00:58] }",
    "2. g4 { [%eval #-1] [%clk 0:00:09] } 2... Qh4# { [%eval #-0] [%clk 0:00:57] } 0-1"
  ].join("\n");

  const games = parsePgnGames(`${chessComGame}\r\n\r\n${lichessGame}\n`);
  assert.equal(games.length, 2);

  // Game 1: Chess.com Blitz 180+2
  const g1 = games[0]!;
  assert.equal(g1.event, "Live Chess");
  assert.equal(g1.site, "Chess.com");
  assert.equal(g1.white, "Alice");
  assert.equal(g1.black, "Bob");
  assert.equal(g1.whiteElo, 1640);
  assert.equal(g1.blackElo, 1615);
  assert.equal(g1.result, "1-0");
  assert.equal(g1.timeControl, "180+2");
  assert.equal(g1.timeClass, "blitz");
  assert.equal(g1.utcDate, "2026.03.14");
  assert.equal(g1.eco, "C20");
  assert.equal(g1.termination, "Alice won by checkmate");
  assert.equal(g1.plies.length, 7);

  // Verify nested variation stripped cleanly and move sequence intact
  assert.deepEqual(
    g1.plies.map((p) => p.san),
    ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]
  );
  assert.deepEqual(
    g1.plies.map((p) => p.uci),
    ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"]
  );

  // Clock math & buckets (180+2):
  // Ply 1 (W): base 180 -> 179.5 => spent 0.5s, rem 179.5s -> impulsive
  assert.equal(g1.plies[0]!.clockRemainingSec, 179.5);
  assert.equal(g1.plies[0]!.timeSpentSec, 0.5);
  assert.equal(g1.plies[0]!.clockBucket, "impulsive");

  // Ply 3 (W): prev 179.5 + inc 2 - 169.0 = 12.5s spent -> deliberate
  assert.equal(g1.plies[2]!.clockRemainingSec, 169);
  assert.equal(g1.plies[2]!.timeSpentSec, 12.5);
  assert.equal(g1.plies[2]!.clockBucket, "deliberate");

  // Ply 5 (W): prev 169 + inc 2 - 170.5 = 0.5s spent, rem 170.5 -> impulsive
  assert.equal(g1.plies[4]!.timeSpentSec, 0.5);
  assert.equal(g1.plies[4]!.clockBucket, "impulsive");

  // Ply 6 (B): rem 12.0 <= 15 in blitz -> time_trouble
  assert.equal(g1.plies[5]!.clockRemainingSec, 12);
  assert.equal(g1.plies[5]!.clockBucket, "time_trouble");

  // Ply 7 (W): rem 8.5 <= 15 -> time_trouble
  assert.equal(g1.plies[6]!.clockBucket, "time_trouble");

  // Game 2: Lichess Bullet 60+0 with [%eval] including #-1 and #-0
  const g2 = games[1]!;
  assert.equal(g2.whiteElo, 1800);
  assert.equal(g2.blackElo, undefined);
  assert.equal(g2.timeClass, "bullet");
  assert.equal(g2.plies.length, 4);

  // Ply 1 eval -0.65 (White moved, Black to move -> sideToMoveCentipawns = +65)
  assert.deepEqual(g2.plies[0]!.preExistingEval, {
    kind: "cp",
    whiteCentipawns: -65,
    sideToMoveCentipawns: 65
  });

  // Ply 3: bullet time_trouble threshold is <= 10 (rem 9s)
  assert.equal(g2.plies[2]!.clockBucket, "time_trouble");
  assert.deepEqual(g2.plies[2]!.preExistingEval, {
    kind: "mate",
    whiteMate: -1,
    sideToMoveMate: 1
  });

  // Ply 4: Fool's mate [%eval #-0] -> Black won (White winPercent = 0, Black winPercent = 100)
  const mate0Eval = g2.plies[3]!.preExistingEval;
  assert.ok(mate0Eval && mate0Eval.kind === "mate");
  assert.equal(winPercent(mate0Eval, "white"), 0);
  assert.equal(winPercent(mate0Eval, "black"), 100);
});

test("normalizes all time classes and handles malformed clock/eval comments safely", () => {
  assert.equal(normalizeTimeClass("60+0"), "bullet");
  assert.equal(normalizeTimeClass("120+1"), "bullet"); // 160 < 180
  assert.equal(normalizeTimeClass("180+0"), "blitz"); // 180
  assert.equal(normalizeTimeClass("180+2"), "blitz"); // 260
  assert.equal(normalizeTimeClass("300+3"), "blitz"); // 420
  assert.equal(normalizeTimeClass("600+0"), "rapid"); // 600
  assert.equal(normalizeTimeClass("900+10"), "rapid"); // 1300
  assert.equal(normalizeTimeClass("900+15"), "classical"); // 1500
  assert.equal(normalizeTimeClass("1800+0"), "classical");
  assert.equal(normalizeTimeClass("1/86400"), "daily");
  assert.equal(normalizeTimeClass("1/259200"), "daily");
  assert.equal(normalizeTimeClass("-"), "unknown");
  assert.equal(normalizeTimeClass("?"), "unknown");
  assert.equal(normalizeTimeClass(undefined), "unknown");

  // Bullet vs non-bullet time_trouble threshold
  assert.equal(
    classifyClockBucket({ clockRemainingSec: 12, timeSpentSec: 1, timeClass: "bullet" }),
    "unknown"
  );
  assert.equal(
    classifyClockBucket({ clockRemainingSec: 10, timeSpentSec: 1, timeClass: "bullet" }),
    "time_trouble"
  );
  assert.equal(
    classifyClockBucket({ clockRemainingSec: 15, timeSpentSec: 1, timeClass: "blitz" }),
    "time_trouble"
  );

  // Corrupted tags never throw
  assert.equal(parseClockComment("[%clk invalid]"), undefined);
  assert.equal(parseClockComment("[%clk 0:99:10]"), undefined);
  assert.equal(parseClockComment("[%clk -0:01:00]"), undefined);
  assert.equal(parseClockComment("[%clk 0:02:58.5]"), 178.5);

  const startFen = new Chess().fen();
  assert.equal(parseEvalComment("[%eval broken]", startFen), undefined);
  assert.equal(parseEvalComment("[%eval #abc]", startFen), undefined);

  // Mate #0 / #-0 / #3 / #-2 regression checks (chessticize-worker#27)
  const mate3 = parseEvalComment("[%eval #3]", startFen);
  assert.deepEqual(mate3, { kind: "mate", whiteMate: 3, sideToMoveMate: 3 });

  const mateNeg2 = parseEvalComment("[%eval #-2]", startFen);
  assert.deepEqual(mateNeg2, { kind: "mate", whiteMate: -2, sideToMoveMate: -2 });

  const matePos0 = parseEvalComment("[%eval #0]", "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4", "w", true);
  assert.ok(matePos0);
  assert.equal(winPercent(matePos0, "white"), 100);
  assert.equal(winPercent(matePos0, "black"), 0);

  // Even if an exporter writes [#0] instead of [#-0] when Black checkmates White, checkmate board resolves winner
  const mate0ByBlack = parseEvalComment("[%eval #0]", "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", "b", true);
  assert.ok(mate0ByBlack);
  assert.equal(winPercent(mate0ByBlack, "white"), 0);
  assert.equal(winPercent(mate0ByBlack, "black"), 100);
});

// ---------------------------------------------------------------------------
// 3. Move classification tests
// ---------------------------------------------------------------------------

test("classifies best, great, book, good, inaccuracy, mistake, blunder, and missed_win accurately", () => {
  assert.equal(
    classifyMove({
      moverWinPercentBefore: 50,
      moverWinPercentAfter: 50,
      playedUci: "e2e4",
      bestMove: "e2e4"
    }),
    "best"
  );

  // Great move: only winning/saving move with >= 15% gap over 2nd best
  assert.equal(
    classifyMove({
      moverWinPercentBefore: 72,
      moverWinPercentAfter: 72,
      playedUci: "d1h5",
      bestMove: "d1h5",
      secondBestMoverWinPercent: 48
    }),
    "great"
  );

  // Book move (when bookMaxPly enabled + ECO present + near-equal eval)
  assert.equal(
    classifyMove({
      moverWinPercentBefore: 50,
      moverWinPercentAfter: 50,
      playedUci: "e2e4",
      bestMove: "d2d4",
      ply: 1,
      eco: "C50",
      bookMaxPly: 6
    }),
    "book"
  );

  assert.equal(
    classifyMove({
      moverWinPercentBefore: 52,
      moverWinPercentAfter: 49.5,
      playedUci: "g1f3",
      bestMove: "d2d4"
    }),
    "good"
  );

  assert.equal(
    classifyMove({
      moverWinPercentBefore: 55,
      moverWinPercentAfter: 48,
      playedUci: "a2a3",
      bestMove: "d2d4"
    }),
    "inaccuracy"
  );

  assert.equal(
    classifyMove({
      moverWinPercentBefore: 55,
      moverWinPercentAfter: 41,
      playedUci: "h2h4",
      bestMove: "d2d4"
    }),
    "mistake"
  );

  assert.equal(
    classifyMove({
      moverWinPercentBefore: 55,
      moverWinPercentAfter: 30,
      playedUci: "f2f3",
      bestMove: "d2d4"
    }),
    "blunder"
  );

  // Missed win: >= 80% -> <= 55% with >= 20% drop
  assert.equal(
    classifyMove({
      moverWinPercentBefore: 86,
      moverWinPercentAfter: 52,
      playedUci: "a1b1",
      bestMove: "d1h5"
    }),
    "missed_win"
  );

  // Key moment detection: >= 15% loss OR forced mate appears/disappears
  assert.equal(
    isKeyMomentCandidatePly({
      scoreBefore: cpScore(50, "w"),
      scoreAfter: cpScore(-250, "b"),
      winPercentLoss: 25
    }),
    true
  );
  assert.equal(
    isKeyMomentCandidatePly({
      scoreBefore: cpScore(20, "w"),
      scoreAfter: mateScore(-3, "b"),
      winPercentLoss: 0
    }),
    true
  );
  assert.equal(
    isKeyMomentCandidatePly({
      scoreBefore: mateScore(1, "w"),
      scoreAfter: mateScore(0, "b"),
      winPercentLoss: 0
    }),
    false
  );
});

// ---------------------------------------------------------------------------
// 4. Pre-evaluated Lichess PGN hydration skips engine calls
// ---------------------------------------------------------------------------

test("hydrates pre-evaluated Lichess PGN immediately with zero engine calls", async () => {
  const preEvaluatedPgn = [
    '[Event "Rated Rapid game"]',
    '[Site "https://lichess.org/preEval1"]',
    '[White "PlayerA"]',
    '[Black "PlayerB"]',
    '[Result "1-0"]',
    '[TimeControl "600+0"]',
    "",
    "1. e4 { [%eval 0.20] [%clk 0:09:58] } 1... e5 { [%eval 0.25] [%clk 0:09:57] }",
    "2. Nf3 { [%eval 0.22] [%clk 0:09:54] } 2... f6 { [%eval 2.20] [%clk 0:09:50] }",
    "3. Nxe5 { [%eval 2.15] [%clk 0:09:45] } 3... fxe5 { [%eval 6.50] [%clk 0:09:42] }",
    "4. Qh5+ { [%eval #3] [%clk 0:09:40] } 4... g6 { [%eval #2] [%clk 0:09:35] }",
    "5. Qxe5+ { [%eval 6.20] [%clk 0:09:30] } 5... Qe7 { [%eval 6.40] [%clk 0:09:20] }",
    "6. Qxh8 { [%eval 7.10] [%clk 0:09:15] } 1-0"
  ].join("\n");

  const { engine, requests } = createFakeEngine(new Map());
  const streamed: Array<{ ply: number; completed: number; total: number }> = [];

  const report = await evaluateGamePass1({
    pgn: preEvaluatedPgn,
    engine,
    userColor: "w",
    options: {
      onPlyEvaluated: (plyEval, progress) => {
        streamed.push({
          ply: plyEval.ply,
          completed: progress.completedPlies,
          total: progress.totalPlies
        });
      }
    }
  });

  assert.equal(requests.length, 0, "must not call engine when pre-existing evals are complete");
  assert.equal(report.isComplete, true);
  assert.equal(report.checkpointPly, 11);
  assert.equal(report.plies.length, 11);
  assert.equal(report.evalGraph.length, 12); // ply 0 + 11 plies
  assert.equal(report.userColor, "w");
  assert.ok(report.plies.every((ply) => ply.fromPreExistingEval));
  assert.equal(streamed.length, 11);
  assert.deepEqual(streamed[0], { ply: 1, completed: 1, total: 11 });
  assert.deepEqual(streamed[10], { ply: 11, completed: 11, total: 11 });

  // Black blundered on 2... f6 (ply 4) and 3... fxe5 (ply 6); White missed forced mate on ply 9 (5. Qxe5+)
  assert.ok(report.keyMomentPlies.includes(4), "ply 4 (2... f6) should be a key moment candidate");
  assert.ok(report.keyMomentPlies.includes(6), "ply 6 (3... fxe5) should be a key moment candidate");
  assert.ok(report.keyMomentPlies.includes(9), "ply 9 (mate disappeared) should be a key moment candidate");
  assert.ok(report.whiteAccuracy > report.blackAccuracy);
});

// ---------------------------------------------------------------------------
// 5. Pass-1 streaming, abort at ply 25, and checkpoint resume equivalence
// ---------------------------------------------------------------------------

test("Pass-1 abort at ply 25 and checkpoint resume produces an identical report to an uninterrupted run", async () => {
  // 30-ply legal game (15 full moves)
  const longPgn = [
    '[Event "Rated Rapid game"]',
    '[White "Alpha"]',
    '[Black "Beta"]',
    '[Result "*"]',
    '[TimeControl "600+5"]',
    "",
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7",
    "6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5",
    "11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 *"
  ].join("\n");

  const parsed = parsePgnGame(longPgn);
  assert.equal(parsed.plies.length, 30);

  // Deterministic per-FEN evaluation table with realistic swings (inaccuracy, mistake, blunder, missed_win)
  const scoreSequenceWhiteCp = [
    20, // ply 0 (startpos)
    25, 20, 25, 18, 22, 15, 20, 25, 18, 22, // plies 1..10
    25, 180, // ply 12 (Black mistake)
    185, 175,
    180, 420, // ply 16 (Black blunder -> White clearly winning >80%)
    50, // ply 17 (White missed_win: drops from >80% to ~54%)
    45, 50, 40,
    45, 30, 35, 25, 30, // plies 21..25
    25, // ply 26 (Black)
    -320, // ply 27 (White blunder after resume point!)
    -310, -305, -295 // plies 28..30
  ];

  const evalTable = new Map<string, { score: AnalysisScore; bestMove?: string }>();
  const startFen = parsed.plies[0]!.fenBefore;
  evalTable.set(startFen, {
    score: cpScore(scoreSequenceWhiteCp[0]!, "w"),
    bestMove: parsed.plies[0]!.uci
  });
  for (let i = 0; i < parsed.plies.length; i += 1) {
    const ply = parsed.plies[i]!;
    const sideAfter = ply.fenAfter.split(/\s+/)[1] === "b" ? "b" : "w";
    const nextPly = parsed.plies[i + 1];
    // For swing plies (12, 16, 17, 27), set a different bestMove so they don't match playedUci
    const isSwingNext = nextPly && [12, 16, 17, 27].includes(nextPly.ply);
    const altMove = nextPly
      ? new Chess(nextPly.fenBefore)
          .moves({ verbose: true })
          .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`)
          .find((u) => u !== nextPly.uci)
      : undefined;
    evalTable.set(ply.fenAfter, {
      score: cpScore(scoreSequenceWhiteCp[i + 1]!, sideAfter),
      ...(nextPly
        ? { bestMove: isSwingNext && altMove ? altMove : nextPly.uci }
        : {})
    });
  }

  // Run 1: Uninterrupted full evaluation
  const fullRun = createFakeEngine(evalTable);
  const fullProgress: number[] = [];
  const fullReport = await evaluateGamePass1({
    pgn: longPgn,
    engine: fullRun.engine,
    userColor: "w",
    options: {
      onPlyEvaluated: (_plyEval, progress) => {
        fullProgress.push(progress.completedPlies);
      }
    }
  });

  assert.equal(fullReport.isComplete, true);
  assert.equal(fullReport.checkpointPly, 30);
  assert.equal(fullReport.plies.length, 30);
  assert.equal(fullProgress.length, 30);
  assert.equal(fullRun.requests[0]?.newGame, true);
  assert.ok(fullRun.requests.slice(1).every((r) => r.newGame === false));
  assert.equal(fullRun.requests[0]?.depth, 12);
  assert.equal(fullRun.requests[0]?.nodes, 80_000);
  assert.equal(fullRun.requests[0]?.multiPv, 1);

  // Verify expected classifications in full report
  assert.equal(fullReport.plies[16]!.classification, "missed_win");
  assert.equal(fullReport.plies[26]!.classification, "blunder");
  assert.ok(fullReport.keyMomentPlies.includes(17));
  assert.ok(fullReport.keyMomentPlies.includes(27));

  // Run 2A: Abort right after ply 25 is emitted
  const abortController = new AbortController();
  const partialRun = createFakeEngine(evalTable);
  const partialStreamed: GamePlyEvaluation[] = [];

  const partialReport = await evaluateGamePass1({
    pgn: longPgn,
    engine: partialRun.engine,
    userColor: "w",
    options: {
      signal: abortController.signal,
      onPlyEvaluated: (plyEval) => {
        partialStreamed.push(plyEval);
        if (plyEval.ply === 25) {
          abortController.abort();
        }
      }
    }
  });

  assert.equal(partialReport.isComplete, false);
  assert.equal(partialReport.checkpointPly, 25);
  assert.equal(partialReport.plies.length, 25);
  assert.equal(partialStreamed.length, 25);

  // Run 2B: Resume from ply 25 checkpoint
  const resumeRun = createFakeEngine(evalTable);
  const resumedProgress: number[] = [];

  const resumedReport = await evaluateGamePass1({
    pgn: longPgn,
    engine: resumeRun.engine,
    userColor: "w",
    options: {
      initialEvaluations: partialReport.plies,
      onPlyEvaluated: (_plyEval, progress) => {
        resumedProgress.push(progress.completedPlies);
      }
    }
  });

  assert.equal(resumedReport.isComplete, true);
  assert.equal(resumedReport.checkpointPly, 30);
  assert.deepEqual(resumedProgress, [26, 27, 28, 29, 30]);
  // Resume only queries boundary fenBefore(26) + plies 26..30 = 6 engine calls instead of 31
  assert.equal(resumeRun.requests.length, 6);
  assert.equal(resumeRun.requests[0]?.newGame, true);
  assert.ok(resumeRun.requests.slice(1).every((r) => r.newGame === false));

  // Final report after resume MUST be identical to the uninterrupted run
  assert.deepEqual(resumedReport, fullReport);
});

test("handles mid-request AbortError gracefully without losing already-evaluated plies", async () => {
  const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6";
  const controller = new AbortController();
  let callCount = 0;

  const { engine } = createFakeEngine(new Map(), {
    rejectOnAbort: true,
    onAnalyze: () => {
      callCount += 1;
      // Call 1 = startpos, Call 2 = after ply 1, Call 3 = after ply 2, Call 4 = after ply 3 -> abort
      if (callCount === 4) {
        controller.abort();
      }
    }
  });

  const report = await evaluateGamePass1({
    pgn,
    engine,
    options: {
      signal: controller.signal
    }
  });

  assert.equal(report.isComplete, false);
  assert.equal(report.checkpointPly, 2);
  assert.equal(report.plies.length, 2);
});

test("hydrates Lichess PGN where terminal checkmate ply omits [%eval] and compares balanced vs one-sided accuracy", async () => {
  // Scholar's mate where final Qxf7# has no [%eval] tag (common Lichess export format)
  const scholarsMatePgn = [
    '[Event "Rated Blitz game"]',
    '[TimeControl "180+0"]',
    '[Result "1-0"]',
    "",
    "1. e4 { [%eval 0.20] } 1... e5 { [%eval 0.25] }",
    "2. Qh5 { [%eval -0.50] } 2... Nc6 { [%eval -0.45] }",
    "3. Bc4 { [%eval -0.40] } 3... Nf6 { [%eval #1] }",
    "4. Qxf7# 1-0"
  ].join("\n");

  const { engine, requests } = createFakeEngine(new Map());
  const report = await evaluateGamePass1({ pgn: scholarsMatePgn, engine });

  assert.equal(requests.length, 0);
  assert.equal(report.isComplete, true);
  assert.equal(report.plies.length, 7);
  assert.equal(report.plies[6]!.whiteWinPercent, 100);
  assert.equal(report.plies[6]!.classification, "best");
  // Black's 3... Nf6 hung mate-in-1 -> blunder & key moment
  assert.equal(report.plies[5]!.classification, "blunder");
  assert.ok(report.keyMomentPlies.includes(6));
  assert.ok(report.whiteAccuracy > report.blackAccuracy);
  assert.equal(report.summaryBySide.b.classifications.blunder, 1);
  assert.equal(report.summaryBySide.w.totalMoves, 4);
  assert.equal(report.summaryBySide.b.totalMoves, 3);
});
