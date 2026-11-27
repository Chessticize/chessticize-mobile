import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import type { AnalysisScore, EngineAnalysisLine } from "../src/engine-analysis.ts";
import { SERVER_CURATED_THEME_GROUPS } from "../src/theme-catalog.ts";
import {
  checkZugzwang,
  detectPhaseTag,
  tagPuzzle,
  tagPuzzleWithPvEnrichment,
  type PuzzleExtractionEngine,
  type TagPuzzleInput,
  type TagPuzzleResult
} from "../src/game-puzzles/index.ts";

function cpLine(fen: string, move: string, whiteCentipawns: number): EngineAnalysisLine {
  const turn = fen.split(/\s+/)[1] === "b" ? "b" : "w";
  const score: AnalysisScore = {
    kind: "cp",
    whiteCentipawns,
    sideToMoveCentipawns: turn === "w" ? whiteCentipawns : -whiteCentipawns
  };
  return { move, pv: [move], multipv: 1, depth: 18, score };
}

function assertLegalSequence(initialFen: string, moves: readonly string[]): void {
  const board = new Chess(initialFen);
  for (const uci of moves) {
    const played = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {})
    });
    assert.ok(played, `Expected legal move ${uci} from ${board.fen()}`);
  }
}

function tagLegalPuzzle(input: TagPuzzleInput): TagPuzzleResult {
  assertLegalSequence(input.initialFen, input.solutionMoves);
  return tagPuzzle(input);
}

test("checkmates group: mateIn1, mateIn2, mateIn3, mateIn4, backRankMate, smotheredMate", () => {
  // 1. mateIn1 + backRankMate
  const backRank = tagLegalPuzzle({
    initialFen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
    solutionMoves: ["g8h8", "d1d8"],
    cp: 9999
  });
  assert.ok(backRank.themes.includes("mateIn1"));
  assert.ok(backRank.themes.includes("mate"));
  assert.ok(backRank.themes.includes("backRankMate"));
  assert.equal(backRank.lengthTag, "oneMove");

  // 2. mateIn2 + smotheredMate (Philidor's Legacy: Qg8+ Rxg8 Nf7#)
  const philidor = tagLegalPuzzle({
    initialFen: "5r1k/6pp/8/6N1/8/1Q6/5PPP/6K1 b - - 0 1",
    solutionMoves: ["f8b8", "b3g8", "b8g8", "g5f7"],
    cp: 9998
  });
  assert.ok(philidor.themes.includes("mateIn2"));
  assert.ok(philidor.themes.includes("smotheredMate"));
  assert.equal(philidor.lengthTag, "short");

  // 3. mateIn3 + backRankMate (battery sacrifice down e-file)
  const batteryMate3 = tagLegalPuzzle({
    initialFen: "r1r3k1/1p3ppp/8/8/8/4Q3/4RPPP/4R1K1 b - - 0 1",
    solutionMoves: ["b7b6", "e3e8", "c8e8", "e2e8", "a8e8", "e1e8"],
    cp: 9997
  });
  assert.ok(batteryMate3.themes.includes("mateIn3"));
  assert.ok(batteryMate3.themes.includes("backRankMate"));
  assert.equal(batteryMate3.lengthTag, "long");

  // 4. mateIn4 + backRankMate (4 consecutive captures on e8)
  const exactMate4 = tagLegalPuzzle({
    initialFen: "r1r3k1/1p1q1ppp/8/8/4Q3/4R3/4RPPP/4R1K1 b - - 0 1",
    solutionMoves: ["b7b6", "e4e8", "d7e8", "e3e8", "c8e8", "e2e8", "a8e8", "e1e8"],
    cp: 9996
  });
  assert.ok(exactMate4.themes.includes("mateIn4"));
  assert.equal(exactMate4.lengthTag, "veryLong");
});

test("piece_tactics group: fork, pin, skewer, discoveredAttack, doubleCheck, xRayAttack, hangingPiece, trappedPiece, capturingDefender", () => {
  // 1. fork: White Knight forks Black King (e8) and Rook (a8) from c7
  const forkResult = tagLegalPuzzle({
    initialFen: "r3k3/pp3ppp/8/1N6/8/8/PP3PPP/5RK1 b q - 0 1",
    solutionMoves: ["a7a6", "b5c7", "e8d8", "c7a8"],
    cp: 600
  });
  assert.ok(forkResult.themes.includes("fork"));

  // 2. pin: White Bishop pins Black Queen (d6) to King (f8)
  const pinResult = tagLegalPuzzle({
    initialFen: "5k2/ppp2ppp/3q4/8/8/2B5/PPP2PPP/6K1 b - - 0 1",
    solutionMoves: ["a7a6", "c3b4", "c7c5", "b4c5"],
    cp: 700
  });
  assert.ok(pinResult.themes.includes("pin"));

  // 3. skewer: White Bishop checks Black King on c5, winning Rook behind it on f8
  const exactSkewer = tagLegalPuzzle({
    initialFen: "5r2/p7/8/2k5/8/8/5PPP/2B3K1 b - - 0 1",
    solutionMoves: ["a7a6", "c1a3", "c5d5", "a3f8"],
    cp: 550
  });
  assert.ok(exactSkewer.themes.includes("skewer"));

  // 4a. doubleCheck: Knight moves off e-file revealing Rook check while also checking King
  const doubleCheckResult = tagLegalPuzzle({
    initialFen: "r3k3/pp3ppp/4N3/8/8/8/PPP2PPP/4R1K1 b q - 0 1",
    solutionMoves: ["a7a6", "e6c7", "e8d7", "c7a8"],
    cp: 650
  });
  assert.ok(doubleCheckResult.themes.includes("doubleCheck"));

  // 4b. discoveredAttack: Knight moves off e-file revealing Rook check (while attacking h8)
  const discoveredAttackResult = tagLegalPuzzle({
    initialFen: "4k2r/ppp2ppp/8/4N3/8/8/PPP2PPP/4R1K1 b k - 0 1",
    solutionMoves: ["a7a6", "e5g6", "e8d7", "g6h8"],
    cp: 650
  });
  assert.ok(discoveredAttackResult.themes.includes("discoveredAttack"));

  // 5. xRayAttack: White Queen recaptures on d8 through where Black's Rook came from (d6)
  const xrayResult = tagLegalPuzzle({
    initialFen: "2R5/5pkp/3r4/8/8/8/5PPP/3Q2K1 b - - 0 1",
    solutionMoves: ["h7h6", "c8d8", "d6d8", "d1d8"],
    cp: 600
  });
  assert.ok(xrayResult.themes.includes("xRayAttack"));

  // 6. hangingPiece: Black moves Knight to undefended d5, White Queen captures
  const hangingResult = tagLegalPuzzle({
    initialFen: "6k1/5ppp/8/8/8/2n5/5PPP/3Q2K1 b - - 0 1",
    solutionMoves: ["c3d5", "d1d5"],
    cp: 350
  });
  assert.ok(hangingResult.themes.includes("hangingPiece"));

  // 7. trappedPiece: Black Bishop on h2 has no safe escape squares
  const trappedResult = tagLegalPuzzle({
    initialFen: "6k1/pp3ppp/8/8/8/6P1/5PKb/4R3 b - - 0 1",
    solutionMoves: ["a7a6", "e1h1", "h2g1", "h1g1"],
    cp: 400
  });
  assert.ok(trappedResult.themes.includes("trappedPiece"));

  // 8. capturingDefender: White captures Knight on f6 that defended Black Queen on d5
  const capDefResult = tagLegalPuzzle({
    initialFen: "6k1/5ppp/5n2/3q2B1/8/8/5PPP/3Q2K1 b - - 0 1",
    solutionMoves: ["h7h6", "g5f6", "g7f6", "d1d5"],
    cp: 700
  });
  assert.ok(capDefResult.themes.includes("capturingDefender"));
});

test("forcing_motifs group: sacrifice, deflection (PR #27 fix), attraction, intermezzo, interference", () => {
  // 1. sacrifice: White sacrifices Rook on f7, then plays Qd8# while down a rook in material
  const sacrificeClean = tagLegalPuzzle({
    initialFen: "5rk1/p4ppp/8/8/2B5/8/6PP/3Q1RK1 b - - 0 1",
    solutionMoves: ["a7a6", "f1f7", "f8f7", "d1d8"],
    cp: 9999
  });
  assert.ok(sacrificeClean.themes.includes("sacrifice"));

  // 2. deflection (verifies PR #27 piece-value comparison: Queen(9) captures Rook(5) after deflecting Black Queen(9))
  const deflectionResult = tagLegalPuzzle({
    initialFen: "6k1/p1q1rppp/8/8/8/8/4QPPP/1R4K1 b - - 0 1",
    solutionMoves: ["a7a6", "b1b8", "c7b8", "e2e7"],
    cp: 600
  });
  assert.ok(deflectionResult.themes.includes("deflection"));

  // 3. attraction: White Rook check on h7 attracts Black King to h7, followed by Qh3+ attacking h7
  const attractionResult = tagLegalPuzzle({
    initialFen: "6k1/p4pp1/8/8/8/2Q5/5PP1/6KR b - - 0 1",
    solutionMoves: ["a7a6", "h1h7", "g8h7", "c3h3"],
    cp: 700
  });
  assert.ok(attractionResult.themes.includes("attraction"));

  // 4. intermezzo: After Black Qxd4, White plays in-between check Bb5+ before recapturing Rxd4
  const exactIntermezzo = tagLegalPuzzle({
    initialFen: "3qk3/p4ppp/8/8/3N4/8/5PPP/3R1BK1 b - - 0 1",
    solutionMoves: ["d8d4", "f1b5", "e8f8", "d1d4"],
    cp: 700
  });
  assert.ok(exactIntermezzo.themes.includes("intermezzo"));

  // 5. interference: White Knight jumps to c7 blocking Ra7's defense of Qe7, then Qxe7
  const interferenceResult = tagLegalPuzzle({
    initialFen: "7k/r3q1pp/8/1N6/8/8/4QPPP/6K1 b - - 0 1",
    solutionMoves: ["h7h6", "b5c7", "h8g8", "e2e7"],
    cp: 800
  });
  assert.ok(interferenceResult.themes.includes("interference"));
});

test("pawns_and_endings group: advancedPawn, pawnEndgame, promotion, and zugzwang hook", async () => {
  // 1. advancedPawn + pawnEndgame + promotion (all-pawn board on plies 0 & 1, then promotes on ply 3)
  const pawnEndgameResult = tagLegalPuzzle({
    initialFen: "8/8/2P3k1/8/8/8/5K2/8 b - - 0 1",
    solutionMoves: ["g6f6", "c6c7", "f6e7", "c7c8q"],
    cp: 900
  });
  assert.ok(pawnEndgameResult.themes.includes("advancedPawn"));
  assert.ok(pawnEndgameResult.themes.includes("promotion"));
  assert.ok(pawnEndgameResult.themes.includes("pawnEndgame"));
  assert.equal(pawnEndgameResult.phaseTag, "endgame");

  // 2. Opening, middlegame, and endgame phase detection
  assert.equal(
    detectPhaseTag("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", 3),
    "opening"
  );
  assert.equal(
    detectPhaseTag("r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 12", 24),
    "middlegame"
  );
  assert.equal(detectPhaseTag("8/5pk1/8/8/8/8/5PK1/3R4 w - - 0 40", 80), "endgame");

  // 3. Optional zugzwang hook: defender loses > 0.3 win chance by having to move vs null move
  const zugFen = "8/8/8/8/8/4k3/4P3/4K3 b - - 0 1";
  assertLegalSequence(zugFen, ["e3e4", "e1d2"]);
  const zugEngine: PuzzleExtractionEngine = {
    async analyze(req) {
      const turn = req.fen.split(/\s+/)[1];
      const whiteScore = turn === "b" ? 600 : 0;
      return [cpLine(req.fen, "e4d4", whiteScore)];
    }
  };
  const isZug = await checkZugzwang({
    engine: zugEngine,
    initialFen: zugFen,
    solutionMoves: ["e3e4", "e1d2"]
  });
  assert.equal(isZug, true);
});

test("1-move blunder PV-3 enrichment preserves oneMove lengthTag and never adds false mate tags (PR #27)", () => {
  // Base 1-move puzzle: 2 plies (setup + White knight forks King & Rook on c7), does NOT end in checkmate.
  // Extended PV (4 plies) reveals the fork capture!
  const initialFen = "r3k3/pp3ppp/8/1N6/8/8/PP3PPP/5RK1 b q - 0 1";
  assertLegalSequence(initialFen, ["a7a6", "b5c7", "e8d8", "c7a8"]);

  const baseOnly = tagPuzzle({
    initialFen,
    solutionMoves: ["a7a6", "b5c7"],
    cp: 500
  });
  assert.equal(baseOnly.lengthTag, "oneMove");
  assert.equal(baseOnly.themes.includes("fork"), false);

  const enriched = tagPuzzleWithPvEnrichment({
    initialFen,
    solutionMoves: ["a7a6", "b5c7"],
    pvMoves: ["a7a6", "b5c7", "e8d8", "c7a8"],
    cp: 500
  });
  assert.ok(enriched.themes.includes("fork"), "PV-3 enrichment should surface fork motif");
  assert.equal(enriched.lengthTag, "oneMove", "Must preserve oneMove lengthTag");
  assert.ok(enriched.allTags.includes("oneMove"));
  assert.equal(enriched.allTags.includes("short"), false);

  // False-mate guard: base 1-move puzzle is NOT checkmate, even if the 4-ply PV ends in checkmate!
  const matePvFen = "5r1k/6pp/8/6N1/8/1Q6/5PPP/6K1 b - - 0 1";
  assertLegalSequence(matePvFen, ["f8b8", "b3g8", "b8g8", "g5f7"]);

  const enrichedNoFalseMate = tagPuzzleWithPvEnrichment({
    initialFen: matePvFen,
    solutionMoves: ["f8b8", "b3g8"],
    pvMoves: ["f8b8", "b3g8", "b8g8", "g5f7"],
    cp: 900
  });
  assert.equal(enrichedNoFalseMate.lengthTag, "oneMove");
  assert.equal(enrichedNoFalseMate.themes.includes("mate"), false);
  assert.equal(enrichedNoFalseMate.themes.includes("mateIn2"), false);
  assert.equal(enrichedNoFalseMate.themes.includes("smotheredMate"), false);
  assert.ok(enrichedNoFalseMate.themes.includes("sacrifice"));
});

test("all 4 SERVER_CURATED_THEME_GROUPS are represented in tagger coverage", () => {
  assert.deepEqual(
    SERVER_CURATED_THEME_GROUPS.map((g) => g.id),
    ["checkmates", "piece_tactics", "forcing_motifs", "pawns_and_endings"]
  );
});
