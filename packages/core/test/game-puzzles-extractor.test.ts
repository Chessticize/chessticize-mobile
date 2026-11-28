import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import type { AnalysisScore, EngineAnalysisLine } from "../src/engine-analysis.ts";
import {
  ALREADY_WINNING_CP,
  ARROW_DUEL_MIN_BEST_CP,
  checkIfUserFoundLine,
  cpScore,
  extractGamePuzzles,
  fenPositionKey,
  isAutoReviewCaliberEligible,
  isValidAttack,
  mateScore,
  verifyArrowDuelPair,
  winChances,
  type ExtractedGamePuzzle,
  type GamePlyEvalInput,
  type PuzzleExtractionEngine,
  type PuzzleExtractionEngineRequest
} from "../src/game-puzzles/index.ts";

function whiteCp(whiteCentipawns: number, fen: string): AnalysisScore {
  const turn = fen.split(/\s+/)[1] === "b" ? "b" : "w";
  return {
    kind: "cp",
    whiteCentipawns,
    sideToMoveCentipawns: turn === "w" ? whiteCentipawns : -whiteCentipawns
  };
}

function whiteMate(whiteMateValue: number, fen: string): AnalysisScore {
  const turn = fen.split(/\s+/)[1] === "b" ? "b" : "w";
  return {
    kind: "mate",
    whiteMate: whiteMateValue,
    sideToMoveMate: turn === "w" ? whiteMateValue : -whiteMateValue
  };
}

function line(
  fen: string,
  move: string,
  score: AnalysisScore,
  options: { multipv?: number; depth?: number; pv?: string[] } = {}
): EngineAnalysisLine {
  return {
    move,
    pv: options.pv ?? [move],
    multipv: options.multipv ?? 1,
    depth: options.depth ?? 18,
    score
  };
}

function buildPliesFromStart(
  startFen: string,
  moves: Array<{
    uci: string;
    evalAfter?: AnalysisScore;
    clockRemainingSec?: number;
    comment?: string;
  }>,
  startingPly = 1
): GamePlyEvalInput[] {
  const board = new Chess(startFen);
  const plies: GamePlyEvalInput[] = [];
  for (let i = 0; i < moves.length; i += 1) {
    const spec = moves[i]!;
    const fenBefore = board.fen();
    const played = board.move({
      from: spec.uci.slice(0, 2),
      to: spec.uci.slice(2, 4),
      ...(spec.uci.length === 5 ? { promotion: spec.uci.slice(4, 5) } : {})
    });
    assert.ok(played, `Expected legal move ${spec.uci} on ${fenBefore}`);
    const fenAfter = board.fen();
    plies.push({
      ply: startingPly + i,
      uci: spec.uci,
      san: played.san,
      fenBefore,
      fenAfter,
      ...(spec.evalAfter !== undefined ? { evalAfter: spec.evalAfter } : {}),
      ...(spec.clockRemainingSec !== undefined ? { clockRemainingSec: spec.clockRemainingSec } : {}),
      ...(spec.comment !== undefined ? { comment: spec.comment } : {})
    });
  }
  return plies;
}

function createScriptedEngine(
  handler: (req: PuzzleExtractionEngineRequest) => EngineAnalysisLine[]
): PuzzleExtractionEngine {
  return {
    async analyze(req: PuzzleExtractionEngineRequest): Promise<EngineAnalysisLine[]> {
      return handler(req);
    }
  };
}

test("winChances uses the lila#11148 sigmoid curve and isValidAttack enforces uniqueness", () => {
  assert.equal(winChances(cpScore(0)), 0);
  assert.ok(Math.abs(winChances(cpScore(300)) - (2 / (1 + Math.exp(-0.00368208 * 300)) - 1)) < 1e-12);
  assert.equal(winChances(mateScore(1)), 1);
  assert.equal(winChances(mateScore(-2)), -1);

  assert.equal(isValidAttack({ move: "e2e4", score: cpScore(100) }, undefined), true);
  assert.equal(isValidAttack({ move: "d1h5", score: mateScore(1) }, { move: "d1f3", score: mateScore(2) }), true);
  assert.equal(isValidAttack({ move: "e4e5", score: cpScore(450) }, { move: "a2a3", score: cpScore(20) }), true);
  // Two winning moves -> not a unique attack (falls through to Arrow Duel / blunder branch)
  assert.equal(isValidAttack({ move: "e4e5", score: cpScore(450) }, { move: "d4d5", score: cpScore(400) }), false);
});

test("verifyArrowDuelPair enforces FEN/turn/caliber gates and captures punishmentLine", async () => {
  // White to move; e2e4 is best (+20), f2f3 is blunder (-420) with refutation d8h4+ g2g3 h4e4
  const startFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  const engine = createScriptedEngine((req) => {
    if (req.searchMoves?.[0] === "f2f3") {
      return [
        line(req.fen, "f2f3", whiteCp(-420, req.fen), {
          pv: ["f2f3", "d8h4", "g2g3", "h4e7"]
        })
      ];
    }
    if (req.searchMoves?.[0] === "g1f3") {
      return [line(req.fen, "g1f3", whiteCp(20, req.fen), { pv: ["g1f3", "b8c6"] })];
    }
    if (req.searchMoves?.[0] === "a2a3") {
      return [line(req.fen, "a2a3", whiteCp(-100, req.fen), { pv: ["a2a3", "g8f6"] })];
    }
    return [line(req.fen, "g1f3", whiteCp(20, req.fen), { pv: ["g1f3", "b8c6"] })];
  });

  // Valid Arrow Duel pair captures White-POV evals & legal punishmentLine
  const valid = await verifyArrowDuelPair({
    engine,
    decisionFen: startFen,
    blunderMove: "f2f3",
    expectedUserColor: "w"
  });
  assert.ok(valid);
  assert.equal(valid.bestMove, "g1f3");
  assert.equal(valid.blunderMove, "f2f3");
  assert.equal(valid.bestEvalWhite, 20);
  assert.equal(valid.blunderEvalWhite, -420);
  assert.equal(valid.decisionFen, startFen);
  assert.deepEqual(valid.punishmentLine, ["d8h4", "g2g3", "h4e7"]);

  // Wrong turn rejected
  assert.equal(
    await verifyArrowDuelPair({ engine, decisionFen: startFen, blunderMove: "f2f3", expectedUserColor: "b" }),
    null
  );

  // Same move rejected
  assert.equal(
    await verifyArrowDuelPair({ engine, decisionFen: startFen, blunderMove: "g1f3", expectedUserColor: "w" }),
    null
  );

  // Small swing (< 200 cp / < 0.35 win chance) rejected
  assert.equal(
    await verifyArrowDuelPair({ engine, decisionFen: startFen, blunderMove: "a2a3", expectedUserColor: "w" }),
    null
  );

  // Illegal move rejected
  assert.equal(
    await verifyArrowDuelPair({ engine, decisionFen: startFen, blunderMove: "e1e5", expectedUserColor: "w" }),
    null
  );

  // Already-lost best move (< -75 cp for mover) rejected
  const lostEngine = createScriptedEngine((req) => {
    if (req.searchMoves?.[0] === "f2f3") {
      return [line(req.fen, "f2f3", whiteCp(-800, req.fen), { pv: ["f2f3", "d8h4"] })];
    }
    return [line(req.fen, "g1f3", whiteCp(ARROW_DUEL_MIN_BEST_CP - 25, req.fen), { pv: ["g1f3"] })];
  });
  assert.equal(
    await verifyArrowDuelPair({ engine: lostEngine, decisionFen: startFen, blunderMove: "f2f3", expectedUserColor: "w" }),
    null
  );

  // Black-to-move POV check: bestEvalWhite and blunderEvalWhite remain White-POV
  const blackFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const blackEngine = createScriptedEngine((req) => {
    if (req.searchMoves?.[0] === "f7f5") {
      return [line(req.fen, "f7f5", whiteCp(380, req.fen), { pv: ["f7f5", "e4f5", "g8f6"] })];
    }
    return [line(req.fen, "e7e5", whiteCp(20, req.fen), { pv: ["e7e5", "g1f3"] })];
  });
  const blackPair = await verifyArrowDuelPair({
    engine: blackEngine,
    decisionFen: blackFen,
    blunderMove: "f7f5",
    expectedUserColor: "b"
  });
  assert.ok(blackPair);
  assert.equal(blackPair.bestEvalWhite, 20);
  assert.equal(blackPair.blunderEvalWhite, 380);
  assert.deepEqual(blackPair.punishmentLine, ["e4f5", "g8f6"]);

  // Single-ply searchMoves PV triggers fallback query on fenAfterBlunder to capture opponent reply.
  const singlePlyPvEngine = createScriptedEngine((req) => {
    if (req.searchMoves?.[0] === "f2f3") {
      return [line(req.fen, "f2f3", whiteCp(-420, req.fen), { pv: ["f2f3"] })];
    }
    if (req.fen === startFen) {
      return [line(req.fen, "g1f3", whiteCp(20, req.fen), { pv: ["g1f3"] })];
    }
    return [line(req.fen, "d8h4", whiteCp(-420, req.fen), { pv: ["d8h4", "g2g3"] })];
  });
  const recovered = await verifyArrowDuelPair({
    engine: singlePlyPvEngine,
    decisionFen: startFen,
    blunderMove: "f2f3",
    expectedUserColor: "w"
  });
  assert.ok(recovered);
  assert.deepEqual(recovered.punishmentLine, ["d8h4", "g2g3"]);
});

test("all 8 moment kinds route properly (own_*_escaped included, opponent_*_caught only in highlights)", async () => {
  // Position where Black hangs a rook on e5 to White's knight/queen, or White blunders on parentFen.
  // Start: 1. e4 e5 2. Nf3 Nc6 — let's use a clean open position with plenty of legal moves.
  const baseFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

  // Helper to run a 2-ply snippet: [mistakePly, responsePly]
  async function runScenario(params: {
    userColor: "w" | "b";
    mistakeMove: string;
    responseMove: string;
    multiSolution: boolean;
    foundInGame: boolean;
  }) {
    const startBoard = new Chess(baseFen);
    // If mistake is by Black, advance 1 quiet White move first (d2d3)
    const preMoves: Array<{ uci: string; evalAfter: AnalysisScore }> = [];
    if (params.userColor === "w" && params.mistakeMove === "f6g4") {
      // Opponent (Black) blunders
      startBoard.move("d3");
    }
    const fenBeforeMistake = startBoard.fen();
    const moverColor = startBoard.turn();
    const winnerColor = moverColor === "w" ? "b" : "w";

    // Eval after mistake strongly favors `winnerColor`
    const winnerSwingWhiteCp = winnerColor === "w" ? 450 : -450;
    const responseWhiteCp = params.foundInGame ? winnerSwingWhiteCp : 0;

    const plies = buildPliesFromStart(
      fenBeforeMistake,
      [
        { uci: params.mistakeMove, evalAfter: whiteCp(winnerSwingWhiteCp, fenBeforeMistake) },
        { uci: params.responseMove, evalAfter: whiteCp(responseWhiteCp, fenBeforeMistake) }
      ],
      7
    );
    // Fix exact sideToMove perspective on evalAfter using actual fenAfter
    plies[0]!.evalAfter = whiteCp(winnerSwingWhiteCp, plies[0]!.fenAfter);
    plies[1]!.evalAfter = whiteCp(responseWhiteCp, plies[1]!.fenAfter);

    const nodeFen = plies[0]!.fenAfter;
    const parentFen = plies[0]!.fenBefore;

    // Pick legal moves on parentFen & nodeFen for the scripted engine
    const parentLegals = new Chess(parentFen).moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
    const bestParentMove = parentLegals.find((m) => m !== params.mistakeMove)!;

    const nodeLegals = new Chess(nodeFen).moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
    const bestNodeMove = params.foundInGame
      ? params.responseMove
      : nodeLegals.find((m) => m !== params.responseMove)!;
    const secondNodeMove = nodeLegals.find((m) => m !== bestNodeMove && m !== params.responseMove)!;

    // Legal reply after bestNodeMove so unique line cooks cleanly to 1 winning move (depth 1 -> opponent has no unique continuation)
    const afterBestNodeFen = new Chess(nodeFen);
    afterBestNodeFen.move({ from: bestNodeMove.slice(0, 2), to: bestNodeMove.slice(2, 4) });
    const oppReplyAfterBest = afterBestNodeFen.moves({ verbose: true })[0]!;
    const oppReplyUci = `${oppReplyAfterBest.from}${oppReplyAfterBest.to}`;
    const afterOppReplyFen = new Chess(afterBestNodeFen.fen());
    afterOppReplyFen.move(oppReplyAfterBest);
    const quietFollowUps = afterOppReplyFen.moves({ verbose: true }).slice(0, 2).map((m) => `${m.from}${m.to}`);

    // Legal punishment line after user's missed move on nodeFen (for opponent_blunder_missed)
    const afterUserMissedBoard = new Chess(nodeFen);
    afterUserMissedBoard.move({ from: params.responseMove.slice(0, 2), to: params.responseMove.slice(2, 4) });
    const punishAfterMissed = afterUserMissedBoard.moves({ verbose: true })[0]!;
    const punishAfterMissedUci = `${punishAfterMissed.from}${punishAfterMissed.to}`;

    const engine = createScriptedEngine((req) => {
      const key = fenPositionKey(req.fen);

      // Parent board (Arrow Duel for own_*)
      if (key === fenPositionKey(parentFen)) {
        if (req.searchMoves?.[0] === params.mistakeMove) {
          return [
            line(req.fen, params.mistakeMove, whiteCp(winnerSwingWhiteCp, req.fen), {
              pv: [params.mistakeMove, bestNodeMove, oppReplyUci]
            })
          ];
        }
        return [line(req.fen, bestParentMove, whiteCp(0, req.fen), { pv: [bestParentMove] })];
      }

      // Node board (after mistake)
      if (key === fenPositionKey(nodeFen)) {
        if (req.searchMoves?.[0] === params.responseMove) {
          return [
            line(req.fen, params.responseMove, whiteCp(0, req.fen), {
              pv: [params.responseMove, punishAfterMissedUci]
            })
          ];
        }
        if (params.multiSolution) {
          return [
            line(req.fen, bestNodeMove, whiteCp(winnerSwingWhiteCp, req.fen), {
              multipv: 1,
              pv: [bestNodeMove, oppReplyUci, quietFollowUps[0]!]
            }),
            line(req.fen, secondNodeMove, whiteCp(winnerColor === "w" ? 430 : -430, req.fen), {
              multipv: 2,
              pv: [secondNodeMove]
            })
          ];
        }
        return [
          line(req.fen, bestNodeMove, whiteCp(winnerSwingWhiteCp, req.fen), {
            multipv: 1,
            pv: [bestNodeMove, oppReplyUci]
          }),
          line(req.fen, secondNodeMove, whiteCp(0, req.fen), {
            multipv: 2,
            pv: [secondNodeMove]
          })
        ];
      }

      // Position after bestNodeMove (defender's reply)
      if (key === fenPositionKey(afterBestNodeFen.fen())) {
        return [line(req.fen, oppReplyUci, whiteCp(winnerSwingWhiteCp, req.fen), { pv: [oppReplyUci] })];
      }

      // After defender's reply: two equal winning follow-ups -> cookAdvantage terminates cleanly at length 1!
      if (key === fenPositionKey(afterOppReplyFen.fen())) {
        return [
          line(req.fen, quietFollowUps[0]!, whiteCp(winnerSwingWhiteCp, req.fen), { multipv: 1 }),
          line(req.fen, quietFollowUps[1]!, whiteCp(winnerSwingWhiteCp, req.fen), { multipv: 2 })
        ];
      }

      // Check-found-line evaluation of user's alternative move when missed
      if (key === fenPositionKey(plies[1]!.fenAfter)) {
        return [line(req.fen, "a1a1", whiteCp(responseWhiteCp, req.fen))];
      }

      return [line(req.fen, "a1a1", whiteCp(0, req.fen))];
    });

    return extractGamePuzzles(
      {
        gameId: "g-8cases",
        userColor: params.userColor,
        plies,
        initialEval: whiteCp(0, fenBeforeMistake)
      },
      engine
    );
  }

  // 1. own_mistake_punished -> emitted as arrow_duel on parentFen with punishmentLine
  const r1 = await runScenario({ userColor: "w", mistakeMove: "f3g5", responseMove: "d7d5", multiSolution: false, foundInGame: true });
  assert.equal(r1.puzzles.length, 1);
  assert.equal(r1.puzzles[0]!.momentKind, "own_mistake_punished");
  assert.equal(r1.puzzles[0]!.puzzleKind, "arrow_duel");
  assert.equal(r1.puzzles[0]!.initialFen, baseFen);
  assert.ok(r1.puzzles[0]!.arrowDuel && r1.puzzles[0]!.arrowDuel.punishmentLine.length >= 1);
  assert.equal(r1.highlights.length, 0);

  // 2. own_mistake_escaped -> STILL emitted as puzzle!
  const r2 = await runScenario({ userColor: "w", mistakeMove: "f3g5", responseMove: "h7h6", multiSolution: false, foundInGame: false });
  const r2Own = r2.puzzles.find((p) => p.momentKind === "own_mistake_escaped");
  assert.ok(r2Own, "own_mistake_escaped must be emitted as a puzzle");
  assert.equal(r2Own.puzzleKind, "arrow_duel");
  assert.equal(r2Own.initialFen, baseFen);

  // 3. own_blunder_punished -> emitted as arrow_duel on parentFen
  const r3 = await runScenario({ userColor: "w", mistakeMove: "f3g5", responseMove: "d7d5", multiSolution: true, foundInGame: true });
  assert.equal(r3.puzzles.length, 1);
  assert.equal(r3.puzzles[0]!.momentKind, "own_blunder_punished");
  assert.equal(r3.puzzles[0]!.puzzleKind, "arrow_duel");
  assert.equal(r3.puzzles[0]!.initialFen, baseFen);

  // 4. own_blunder_escaped -> STILL emitted as arrow_duel on parentFen!
  const r4 = await runScenario({ userColor: "w", mistakeMove: "f3g5", responseMove: "h7h6", multiSolution: true, foundInGame: false });
  const r4Own = r4.puzzles.find((p) => p.momentKind === "own_blunder_escaped");
  assert.ok(r4Own, "own_blunder_escaped must be emitted as a puzzle");
  assert.equal(r4Own.puzzleKind, "arrow_duel");
  assert.equal(r4Own.initialFen, baseFen);

  // 5. opponent_mistake_missed -> emitted as `line` puzzle
  const r5 = await runScenario({ userColor: "w", mistakeMove: "f6g4", responseMove: "h2h3", multiSolution: false, foundInGame: false });
  const r5Opp = r5.puzzles.find((p) => p.momentKind === "opponent_mistake_missed");
  assert.ok(r5Opp, "opponent_mistake_missed must be emitted as a line puzzle");
  assert.equal(r5Opp.puzzleKind, "line");
  assert.equal(r5Opp.solutionMoves[0], "f6g4");
  assert.equal(r5.highlights.length, 0);

  // 6. opponent_blunder_missed -> routed to `arrow_duel` on nodeFen!
  const r6 = await runScenario({ userColor: "w", mistakeMove: "f6g4", responseMove: "h2h3", multiSolution: true, foundInGame: false });
  const r6Opp = r6.puzzles.find((p) => p.momentKind === "opponent_blunder_missed");
  assert.ok(r6Opp, "opponent_blunder_missed must be routed to arrow_duel on nodeFen");
  assert.equal(r6Opp.puzzleKind, "arrow_duel");
  assert.equal(r6Opp.puzzleColor, "w");
  assert.equal(r6Opp.arrowDuel?.blunderMove, "h2h3");
  assert.equal(r6Opp.initialFen, r6Opp.arrowDuel?.decisionFen);
  assert.ok(r6Opp.arrowDuel!.punishmentLine.length >= 1);

  // 7. opponent_mistake_caught -> NEVER emitted in puzzles, ONLY in highlights!
  const r7 = await runScenario({ userColor: "w", mistakeMove: "f6g4", responseMove: "c4f7", multiSolution: false, foundInGame: true });
  assert.equal(r7.puzzles.length, 0);
  assert.equal(r7.highlights.length, 1);
  assert.equal(r7.highlights[0]!.momentKind, "opponent_mistake_caught");
  assert.equal(r7.highlights[0]!.uci, "c4f7");
  assert.equal(r7.highlights[0]!.san, "Bxf7+");
  assert.ok(r7.highlights[0]!.winChanceGain > 0.4);

  // 8. opponent_blunder_caught -> NEVER emitted in puzzles, ONLY in highlights!
  const r8 = await runScenario({ userColor: "w", mistakeMove: "f6g4", responseMove: "c4f7", multiSolution: true, foundInGame: true });
  assert.equal(r8.puzzles.length, 0);
  assert.equal(r8.highlights.length, 1);
  assert.equal(r8.highlights[0]!.momentKind, "opponent_blunder_caught");
  assert.equal(r8.highlights[0]!.uci, "c4f7");
});

test("own_mistake_* falls back to line puzzle when Arrow Duel fails caliber on a clean unique tactical line", async () => {
  const startFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  const plies = buildPliesFromStart(startFen, [
    { uci: "f3g5" },
    { uci: "d7d5" }
  ]);
  plies[0]!.evalAfter = whiteCp(-450, plies[0]!.fenAfter);
  plies[1]!.evalAfter = whiteCp(-450, plies[1]!.fenAfter);

  const afterBest = new Chess(plies[0]!.fenAfter);
  afterBest.move({ from: "d7", to: "d5" });
  const afterReply = new Chess(afterBest.fen());
  afterReply.move({ from: "e4", to: "d5" });

  // Engine makes Arrow Duel fail on parentFen (best move on parentFen is already -120 cp < -75)
  // while nodeFen still has a clean unique tactical punishment line.
  const engine = createScriptedEngine((req) => {
    const key = fenPositionKey(req.fen);
    if (key === fenPositionKey(plies[0]!.fenBefore)) {
      if (req.searchMoves?.[0] === "f3g5") {
        return [line(req.fen, "f3g5", whiteCp(-450, req.fen), { pv: ["f3g5", "d7d5"] })];
      }
      return [line(req.fen, "d2d3", whiteCp(-120, req.fen), { pv: ["d2d3"] })];
    }
    if (key === fenPositionKey(plies[0]!.fenAfter)) {
      return [
        line(req.fen, "d7d5", whiteCp(-450, req.fen), { multipv: 1, pv: ["d7d5", "e4d5"] }),
        line(req.fen, "h7h6", whiteCp(0, req.fen), { multipv: 2, pv: ["h7h6"] })
      ];
    }
    if (key === fenPositionKey(afterBest.fen())) {
      return [line(req.fen, "e4d5", whiteCp(-450, req.fen), { multipv: 1 })];
    }
    if (key === fenPositionKey(afterReply.fen())) {
      return [
        line(req.fen, "f6d5", whiteCp(-450, req.fen), { multipv: 1 }),
        line(req.fen, "c6a5", whiteCp(-440, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "a1a1", whiteCp(-450, req.fen))];
  });

  const result = await extractGamePuzzles(
    {
      gameId: "fallback-line",
      userColor: "w",
      plies,
      initialEval: whiteCp(0, startFen)
    },
    engine
  );
  assert.equal(result.puzzles.length, 1);
  assert.equal(result.puzzles[0]!.momentKind, "own_mistake_punished");
  assert.equal(result.puzzles[0]!.puzzleKind, "line");
  assert.equal(result.puzzles[0]!.arrowDuel, undefined);
});

test("garbage-time positions (+6 -> +4 and -6 -> -9) are rejected, while forced Mate in 1..5 is allowed", async () => {
  const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

  let engineCalls = 0;
  const countingEngine = createScriptedEngine(() => {
    engineCalls += 1;
    return [];
  });

  // Case 1: White is already winning +6.0 (+600 cp) and plays a move dropping to +4.0 (+400 cp).
  // From Black's POV after White's move: prevScore = -600, currentScore = -400 (< -75 -> rejected!).
  // Case 2: Black is already losing -6.0 and blunders to -9.0 -> White's prevScore = +600 (> +300) and non-mate (+900) -> rejected!
  const plies = buildPliesFromStart(fen, [{ uci: "d2d3" }, { uci: "h7h6" }]);
  plies[0]!.evalAfter = whiteCp(400, plies[0]!.fenAfter); // +6.0 -> +4.0
  plies[1]!.evalAfter = whiteCp(900, plies[1]!.fenAfter); // Black -4.0 -> -9.0 (White +4.0 -> +9.0, prevScore = +400 > ALREADY_WINNING_CP)

  const res1 = await extractGamePuzzles(
    {
      userColor: "w",
      plies,
      initialEval: whiteCp(600, fen)
    },
    countingEngine
  );
  assert.equal(res1.puzzles.length, 0);
  assert.equal(engineCalls, 0, "Garbage-time plies should be gated before Pass-2 deep analysis");

  // Case 3: Losing position -6.0 -> -9.0 from White's perspective (White plays move, Black goes +600 -> +900)
  const lostPlies = buildPliesFromStart(fen, [{ uci: "a2a3" }]);
  lostPlies[0]!.evalAfter = whiteCp(-900, lostPlies[0]!.fenAfter);
  const res2 = await extractGamePuzzles(
    {
      userColor: "w",
      plies: lostPlies,
      initialEval: whiteCp(-600, fen)
    },
    countingEngine
  );
  assert.equal(res2.puzzles.length, 0);
  assert.equal(engineCalls, 0);

  // Case 4: Forced Mate in 1 IS extracted even when prevScore > ALREADY_WINNING_CP (+500)
  const mateSetupFen = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1";
  const matePlies = buildPliesFromStart(mateSetupFen, [
    { uci: "g8h8" },
    { uci: "d1d8" } // White misses? Let's make White play a non-mate move h2h3 so it's opponent_mistake_missed
  ]);
  const missedMatePlies = buildPliesFromStart(mateSetupFen, [
    { uci: "g8h8" },
    { uci: "h2h3" }
  ]);
  missedMatePlies[0]!.evalAfter = whiteMate(1, missedMatePlies[0]!.fenAfter);
  missedMatePlies[1]!.evalAfter = whiteCp(500, missedMatePlies[1]!.fenAfter);

  const mateEngine = createScriptedEngine((req) => {
    if (fenPositionKey(req.fen) === fenPositionKey(missedMatePlies[0]!.fenAfter)) {
      return [
        line(req.fen, "d1d8", whiteMate(1, req.fen), { multipv: 1 }),
        line(req.fen, "h2h3", whiteCp(500, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "a7a6", whiteCp(500, req.fen))];
  });

  const resMate = await extractGamePuzzles(
    {
      userColor: "w",
      plies: missedMatePlies,
      initialEval: whiteCp(ALREADY_WINNING_CP + 200, mateSetupFen)
    },
    mateEngine
  );
  assert.equal(resMate.puzzles.length, 1);
  assert.equal(resMate.puzzles[0]!.momentKind, "opponent_mistake_missed");
  assert.equal(resMate.puzzles[0]!.puzzleKind, "line");
  assert.ok(resMate.puzzles[0]!.themes.includes("mateIn1"));
  assert.ok(resMate.puzzles[0]!.themes.includes("backRankMate"));
});

test("depth-10 hallucination guard rejects false positives in both advantage and 1-move blunder branches", async () => {
  const startFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4";
  const plies = buildPliesFromStart(startFen, [{ uci: "f6g4" }, { uci: "h2h3" }]);
  // Pass-1 (depth 10) hallucinates +500 cp for White
  plies[0]!.evalAfter = whiteCp(500, plies[0]!.fenAfter);
  plies[1]!.evalAfter = whiteCp(30, plies[1]!.fenAfter);

  // Branch A: Multi-solution blunder branch where Pass-2 deep eval drops to +30 cp
  const blunderHallucinationEngine = createScriptedEngine((req) => {
    if (fenPositionKey(req.fen) === fenPositionKey(plies[0]!.fenAfter)) {
      return [
        line(req.fen, "c4f7", whiteCp(30, req.fen), { multipv: 1 }),
        line(req.fen, "e1g1", whiteCp(25, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "d7d6", whiteCp(30, req.fen))];
  });
  const resBlunder = await extractGamePuzzles(
    { userColor: "w", plies, initialEval: whiteCp(0, startFen) },
    blunderHallucinationEngine
  );
  assert.equal(resBlunder.puzzles.length, 0);

  // Branch B: Unique advantage branch where Pass-2 deep eval finds unique move only +40 cp (second is -200 cp)
  // winChances(+40) - winChances(0) = 0.07 <= 0.4 -> hallucination discarded!
  const afterUnique = new Chess(plies[0]!.fenAfter);
  afterUnique.move({ from: "e1", to: "g1" });
  const afterReply = new Chess(afterUnique.fen());
  afterReply.move({ from: "d7", to: "d6" });

  const advantageHallucinationEngine = createScriptedEngine((req) => {
    const key = fenPositionKey(req.fen);
    if (key === fenPositionKey(plies[0]!.fenAfter)) {
      return [
        line(req.fen, "e1g1", whiteCp(40, req.fen), { multipv: 1 }),
        line(req.fen, "h2h3", whiteCp(-300, req.fen), { multipv: 2 })
      ];
    }
    if (key === fenPositionKey(afterUnique.fen())) {
      return [line(req.fen, "d7d6", whiteCp(40, req.fen), { multipv: 1 })];
    }
    if (key === fenPositionKey(afterReply.fen())) {
      return [
        line(req.fen, "h2h3", whiteCp(40, req.fen), { multipv: 1 }),
        line(req.fen, "c2c3", whiteCp(35, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "a7a6", whiteCp(40, req.fen))];
  });
  const resAdv = await extractGamePuzzles(
    { userColor: "w", plies, initialEval: whiteCp(0, startFen) },
    advantageHallucinationEngine
  );
  assert.equal(resAdv.puzzles.length, 0);
});

test("checkIfUserFoundLine handles opponent resignation immediately after winning move", async () => {
  const startFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4";
  // Black blunders f6g4, White plays winning move c4f7+, Black resigns immediately (no ply 2!)
  const plies = buildPliesFromStart(startFen, [
    { uci: "f6g4" },
    { uci: "c4f7" }
  ]);
  plies[0]!.evalAfter = whiteCp(450, plies[0]!.fenAfter);
  plies[1]!.evalAfter = whiteCp(440, plies[1]!.fenAfter);

  const engine = createScriptedEngine((req) => [
    line(req.fen, "e8f7", whiteCp(450, req.fen))
  ]);

  // 3-ply solution: [c4f7, e8f7, f3g5], game ended after index 0 (opponent resigned on index 1) -> FOUND!
  const foundOnResign = await checkIfUserFoundLine({
    engine,
    plies,
    startPlyIndex: 0,
    solutionMoves: ["c4f7", "e8f7", "f3g5"],
    winner: "w"
  });
  assert.equal(foundOnResign, true);

  // If game ended BEFORE White even played move 0 -> NOT found!
  const notFoundNoMove = await checkIfUserFoundLine({
    engine,
    plies: plies.slice(0, 1),
    startPlyIndex: 0,
    solutionMoves: ["c4f7", "e8f7", "f3g5"],
    winner: "w"
  });
  assert.equal(notFoundNoMove, false);

  // If White deviated to an equivalent winning move (within 0.12 win-chance drop / 100 cp) -> FOUND!
  const altPlies = buildPliesFromStart(startFen, [
    { uci: "f6g4" },
    { uci: "d2d4" }
  ]);
  altPlies[1]!.evalAfter = whiteCp(400, altPlies[1]!.fenAfter);
  const altEngine = createScriptedEngine((req) => [
    line(req.fen, "e5d4", whiteCp(420, req.fen))
  ]);
  const foundAlt = await checkIfUserFoundLine({
    engine: altEngine,
    plies: altPlies,
    startPlyIndex: 0,
    solutionMoves: ["c4f7"],
    winner: "w"
  });
  assert.equal(foundAlt, true);
});

test("per-game cap, time-trouble deprioritization, clock parsing, and auto-review caliber gate", async () => {
  // Build 4 distinct own-blunder moments in one game: 1 in severe time trouble (<=10s), 3 deliberate (>60s)
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const moves = [
    { uci: "e2e4", clockRemainingSec: 295 }, // ply 1 (W)
    { uci: "e7e5", clockRemainingSec: 294 }, // ply 2 (B)
    { uci: "g1f3", clockRemainingSec: 280 }, // ply 3 (W - blunder #1, deliberate)
    { uci: "b8c6", clockRemainingSec: 278 }, // ply 4 (B)
    { uci: "f1c4", clockRemainingSec: 260 }, // ply 5 (W - blunder #2, deliberate)
    { uci: "g8f6", clockRemainingSec: 255 }, // ply 6 (B)
    { uci: "d2d3", clockRemainingSec: 240 }, // ply 7 (W - blunder #3, deliberate)
    { uci: "f8c5", clockRemainingSec: 235 }, // ply 8 (B)
    { uci: "c2c3", comment: "{ [%clk 0:00:07.5] }" }, // ply 9 (W - blunder #4, severe time trouble!)
    { uci: "d7d6", clockRemainingSec: 230 } // ply 10 (B)
  ];
  const plies = buildPliesFromStart(startFen, moves);

  // Set Pass-1 evals: equal before each White blunder, -500 after each White blunder, back to 0 after Black's reply
  const blunderIndices = new Set([2, 4, 6, 8]);
  for (let i = 0; i < plies.length; i += 1) {
    const scoreCp = blunderIndices.has(i) ? -500 : 0;
    plies[i]!.evalAfter = whiteCp(scoreCp, plies[i]!.fenAfter);
  }

  const blunderBeforeKeys = new Map<string, { blunderMove: string; bestMove: string; punishMove: string }>();
  const blunderAfterKeys = new Map<string, { moves: [string, string] }>();

  for (const idx of blunderIndices) {
    const p = plies[idx]!;
    const parentLegals = new Chess(p.fenBefore).moves({ verbose: true }).map((m) => `${m.from}${m.to}`);
    const bestMove = parentLegals.find((m) => m !== p.uci)!;
    const afterLegals = new Chess(p.fenAfter).moves({ verbose: true }).map((m) => `${m.from}${m.to}`);
    blunderBeforeKeys.set(fenPositionKey(p.fenBefore), {
      blunderMove: p.uci,
      bestMove,
      punishMove: afterLegals[0]!
    });
    blunderAfterKeys.set(fenPositionKey(p.fenAfter), {
      moves: [afterLegals[0]!, afterLegals[1]!]
    });
  }

  const engine = createScriptedEngine((req) => {
    const key = fenPositionKey(req.fen);
    const parentInfo = blunderBeforeKeys.get(key);
    if (parentInfo) {
      if (req.searchMoves?.[0] === parentInfo.blunderMove) {
        return [
          line(req.fen, parentInfo.blunderMove, whiteCp(-500, req.fen), {
            pv: [parentInfo.blunderMove, parentInfo.punishMove]
          })
        ];
      }
      return [line(req.fen, parentInfo.bestMove, whiteCp(0, req.fen), { pv: [parentInfo.bestMove] })];
    }
    const afterInfo = blunderAfterKeys.get(key);
    if (afterInfo) {
      return [
        line(req.fen, afterInfo.moves[0], whiteCp(-500, req.fen), { multipv: 1 }),
        line(req.fen, afterInfo.moves[1], whiteCp(-490, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "a1a1", whiteCp(0, req.fen))];
  });

  const result = await extractGamePuzzles(
    {
      gameId: "cap-game",
      userColor: "w",
      plies,
      timeControl: "300+0",
      initialEval: whiteCp(0, startFen)
    },
    engine
  );

  // All 4 extracted as candidates, default cap returns top 3!
  assert.equal(result.allCandidatePuzzles.length, 4);
  assert.equal(result.puzzles.length, 3);
  // Time-trouble blunder (ply 9, clockRemainingSec = 7.5) is deprioritized below the 3 deliberate blunders!
  assert.ok(result.puzzles.every((p) => p.ply !== 9));
  const timeTroublePuzzle = result.allCandidatePuzzles.find((p) => p.ply === 9)!;
  assert.equal(timeTroublePuzzle.clockRemainingSec, 7.5);
  assert.equal(timeTroublePuzzle.timeSpentSec, 232.5);
  assert.equal(isAutoReviewCaliberEligible(timeTroublePuzzle), false);
  assert.equal(isAutoReviewCaliberEligible(result.puzzles[0]!), true);
});

test("isAutoReviewCaliberEligible enforces chessticize-server#629 rules", () => {
  const baseLine: ExtractedGamePuzzle = {
    idSeed: "seed",
    ply: 10,
    moveNumber: 5,
    puzzleKind: "line",
    momentKind: "opponent_mistake_missed",
    userColor: "w",
    puzzleColor: "w",
    initialFen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
    solutionMoves: ["g8h8", "d1d8", "h8h7", "d8d7"],
    prevCp: 0,
    cp: 500,
    winChanceSwing: 0.85,
    themes: ["advantage", "fork"],
    lengthTag: "short",
    phaseTag: "endgame",
    clockRemainingSec: 120,
    caliberScore: 120
  };

  assert.equal(isAutoReviewCaliberEligible(baseLine), true);
  // Multi-move line with only generic tags -> false
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, themes: ["advantage", "quietMove"] }), false);
  // 1-move line (2 plies) with generic tag -> allowed
  assert.equal(
    isAutoReviewCaliberEligible({ ...baseLine, solutionMoves: ["g8h8", "d1d8"], lengthTag: "oneMove", themes: ["advantage"] }),
    true
  );
  // Excluded mateIn4 / mateIn5 / veryLong / > 6 plies / cp < -75 / severe time trouble
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, themes: ["mate", "mateIn4"] }), false);
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, themes: ["mate", "mateIn5"] }), false);
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, lengthTag: "veryLong" }), false);
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, solutionMoves: ["a", "b", "c", "d", "e", "f", "g", "h"] }), false);
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, cp: -100 }), false);
  assert.equal(isAutoReviewCaliberEligible({ ...baseLine, clockRemainingSec: 8 }), false);
});

test("terminal opponent blunder with immediate opponent resignation does not fabricate opponent_missed puzzle", async () => {
  // Position where Black hangs a knight on d5 (11... Nd5?? -> 12. Rxd5) and immediately resigns (1-0).
  const startFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4";
  const terminalPlies = buildPliesFromStart(startFen, [{ uci: "f6g4" }]);
  terminalPlies[0]!.evalAfter = whiteCp(500, terminalPlies[0]!.fenAfter);

  const afterReply = new Chess(terminalPlies[0]!.fenAfter);
  afterReply.move({ from: "c4", to: "f7" });
  const afterKing = new Chess(afterReply.fen());
  afterKing.move({ from: "e8", to: "f7" });

  const engine = createScriptedEngine((req) => {
    const key = fenPositionKey(req.fen);
    if (key === fenPositionKey(terminalPlies[0]!.fenAfter)) {
      return [
        line(req.fen, "c4f7", whiteCp(500, req.fen), { multipv: 1, pv: ["c4f7", "e8f7", "f3g5"] }),
        line(req.fen, "e1g1", whiteCp(50, req.fen), { multipv: 2 })
      ];
    }
    if (key === fenPositionKey(afterReply.fen())) {
      return [line(req.fen, "e8f7", whiteCp(500, req.fen), { multipv: 1 })];
    }
    if (key === fenPositionKey(afterKing.fen())) {
      return [
        line(req.fen, "f3g5", whiteCp(500, req.fen), { multipv: 1 }),
        line(req.fen, "d2d3", whiteCp(480, req.fen), { multipv: 2 })
      ];
    }
    return [line(req.fen, "a7a6", whiteCp(500, req.fen))];
  });

  // White user won (Black resigned right after blundering) -> skip! Neither puzzle nor highlight.
  const whenOpponentResigned = await extractGamePuzzles(
    {
      gameId: "resign-terminal",
      userColor: "w",
      gameResult: "1-0",
      plies: terminalPlies,
      initialEval: whiteCp(0, startFen)
    },
    engine
  );
  assert.equal(whenOpponentResigned.puzzles.length, 0);
  assert.equal(whenOpponentResigned.highlights.length, 0);

  // White user lost or drew (White resigned/flagged/agreed draw right after Black blundered) -> genuine miss!
  const whenUserResigned = await extractGamePuzzles(
    {
      gameId: "user-resign-terminal",
      userColor: "w",
      gameResult: "0-1",
      plies: terminalPlies,
      initialEval: whiteCp(0, startFen)
    },
    engine
  );
  assert.equal(whenUserResigned.puzzles.length, 1);
  assert.equal(whenUserResigned.puzzles[0]!.momentKind, "opponent_mistake_missed");

  // Multi-move line where White played move 0, Black replied move 1, then Black resigned (1-0) before White's move 2 -> found!
  const multiPlies = buildPliesFromStart(startFen, [
    { uci: "f6g4" },
    { uci: "c4f7" },
    { uci: "e8f7" }
  ]);
  multiPlies[0]!.evalAfter = whiteCp(500, multiPlies[0]!.fenAfter);
  multiPlies[1]!.evalAfter = whiteCp(500, multiPlies[1]!.fenAfter);
  multiPlies[2]!.evalAfter = whiteCp(500, multiPlies[2]!.fenAfter);

  const foundWhenOpponentResignedBeforeMove2 = await checkIfUserFoundLine({
    engine,
    plies: multiPlies,
    startPlyIndex: 0,
    solutionMoves: ["c4f7", "e8f7", "f3g5"],
    winner: "w",
    gameResult: "1-0"
  });
  assert.equal(foundWhenOpponentResignedBeforeMove2, true);

  const missedWhenUserResignedBeforeMove2 = await checkIfUserFoundLine({
    engine,
    plies: multiPlies,
    startPlyIndex: 0,
    solutionMoves: ["c4f7", "e8f7", "f3g5"],
    winner: "w",
    gameResult: "0-1"
  });
  assert.equal(missedWhenUserResignedBeforeMove2, false);
});

test("multi-solution own_blunder Arrow Duel caps punishmentLine to 1 ply instead of dumping raw long PV", async () => {
  // Real game position: Black is down 3 pawns; Qxc2 (~0.0) keeps counterplay,
  // while Qxf3 (+4.0) trades queens into a lost endgame where both gxf3 and Rxf3 win easily.
  const decisionFen = "3r1rk1/p4ppp/1b2p3/4P3/5P2/4PQ2/PPP1q1PP/R1B2RK1 b - - 0 23";
  const plies = buildPliesFromStart(
    decisionFen,
    [
      { uci: "e2f3" },
      { uci: "g2f3" }
    ],
    45
  );
  plies[0]!.evalAfter = whiteCp(398, plies[0]!.fenAfter);
  plies[1]!.evalAfter = whiteCp(398, plies[1]!.fenAfter);

  const longEndgamePv = [
    "e2f3",
    "g2f3",
    "f7f6",
    "e5f6",
    "f8f6",
    "g1g2",
    "d8c8",
    "c2c3",
    "f6g6",
    "g2h1"
  ];
  const engine = createScriptedEngine((req) => {
    if (req.fen === decisionFen && req.searchMoves?.[0] === "e2f3") {
      return [line(req.fen, "e2f3", whiteCp(398, req.fen), { pv: longEndgamePv })];
    }
    if (req.fen === decisionFen) {
      return [line(req.fen, "e2c2", whiteCp(-19, req.fen), { pv: ["e2c2", "b2b3"] })];
    }
    if (req.fen === plies[0]!.fenAfter) {
      // Both gxf3 and Rxf3 win equally -> multi-solution blunder!
      return [
        line(req.fen, "g2f3", whiteCp(398, req.fen), { multipv: 1, pv: longEndgamePv.slice(1) }),
        line(req.fen, "f1f3", whiteCp(399, req.fen), { multipv: 2, pv: ["f1f3", "f7f6"] })
      ];
    }
    return [line(req.fen, "f7f6", whiteCp(398, req.fen), { pv: ["f7f6"] })];
  });

  const result = await extractGamePuzzles(
    {
      gameId: "maia-qxf3-endgame",
      userColor: "b",
      plies,
      initialEval: whiteCp(-19, decisionFen)
    },
    engine
  );

  assert.equal(result.puzzles.length, 1);
  const puzzle = result.puzzles[0]!;
  assert.equal(puzzle.puzzleKind, "arrow_duel");
  assert.equal(puzzle.momentKind, "own_blunder_punished");
  assert.deepEqual(puzzle.arrowDuel?.punishmentLine, ["g2f3"]);
  assert.deepEqual(puzzle.solutionMoves, ["e2f3", "g2f3"]);
});

test("multi-solution tactical Arrow Duel keeps forcing punishment sequence through the material win", async () => {
  // Real game pattern: Black blunders allowing Nxc6 (attacking Queen + uncovering Bxd6).
  // After 1. Nxc6 bxc6 2. Bxd6 Qxd6 3. Qxd6, White wins a full bishop (5 plies),
  // even if multiple White moves win on move 1.
  const decisionFen = "r2q1rk1/pp3ppp/2nbp1b1/8/3Np3/P3P1B1/1PPQBPPP/R3K2R b KQ - 0 13";
  const plies = buildPliesFromStart(
    decisionFen,
    [
      { uci: "h7h6" },
      { uci: "d4c6" }
    ],
    25
  );
  plies[0]!.evalAfter = whiteCp(500, plies[0]!.fenAfter);
  plies[1]!.evalAfter = whiteCp(500, plies[1]!.fenAfter);

  const tacticalPv = ["h7h6", "d4c6", "b7c6", "g3d6", "d8d6", "d2d6", "a8b8"];
  const engine = createScriptedEngine((req) => {
    if (req.fen === decisionFen && req.searchMoves?.[0] === "h7h6") {
      return [line(req.fen, "h7h6", whiteCp(500, req.fen), { pv: tacticalPv })];
    }
    if (req.fen === decisionFen) {
      return [line(req.fen, "c6d4", whiteCp(20, req.fen), { pv: ["c6d4", "e3d4"] })];
    }
    if (req.fen === plies[0]!.fenAfter) {
      // Multi-solution blunder: both Nxc6 and Bxd6 win
      return [
        line(req.fen, "d4c6", whiteCp(500, req.fen), { multipv: 1, pv: tacticalPv.slice(1) }),
        line(req.fen, "g3d6", whiteCp(450, req.fen), { multipv: 2, pv: ["g3d6", "d8d6"] })
      ];
    }
    return [line(req.fen, "b7c6", whiteCp(500, req.fen), { pv: ["b7c6"] })];
  });

  const result = await extractGamePuzzles(
    {
      gameId: "tactical-nxc6-bishop-win",
      userColor: "b",
      plies,
      initialEval: whiteCp(20, decisionFen)
    },
    engine
  );

  assert.equal(result.puzzles.length, 1);
  const puzzle = result.puzzles[0]!;
  assert.equal(puzzle.puzzleKind, "arrow_duel");
  assert.deepEqual(puzzle.arrowDuel?.punishmentLine, ["d4c6", "b7c6", "g3d6", "d8d6", "d2d6"]);
  assert.deepEqual(puzzle.solutionMoves, ["h7h6", "d4c6", "b7c6", "g3d6", "d8d6", "d2d6"]);
});
