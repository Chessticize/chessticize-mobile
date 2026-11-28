import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAIA_SETUP_PREFERENCES,
  MAIA_TIME_CONTROL_PRESETS,
  abortMaiaGame,
  applyMaiaGameMove,
  applyMaiaGameRatingResult,
  buildImportedGameDraftFromMaiaGame,
  canAbortMaiaGame,
  classifyMaiaTimeControl,
  computeLiveMaiaClocksMs,
  computeMaiaThinkTimeMs,
  createDefaultMaiaRatingRecord,
  createMaiaGameState,
  hasInsufficientMaterialToWinOnTime,
  isMaiaPromotionMove,
  maiaGameOutcomeForUser,
  normalizeMaiaTimeControl,
  offerDrawToMaia,
  parsePgnGame,
  pauseMaiaGameClock,
  preferredMaiaRatingAnchor,
  recomputeMaiaRatingFromGames,
  resignMaiaGame,
  resolveMaiaTimeout,
  resumeMaiaGameClock,
  selectMaiaMove,
  setMaiaGameThinkingPace,
  suggestInitialMaiaRating,
  type HumanPolicyModel,
  type MaiaGameState,
  type MaiaRatedGameRecord
} from "../src/index.ts";

test("time control presets cover Blitz (including 5+3), Rapid, and Classical (including Unlimited) without Bullet", () => {
  const byClass = {
    blitz: MAIA_TIME_CONTROL_PRESETS.filter((p) => p.timeClass === "blitz").map((p) => p.id),
    rapid: MAIA_TIME_CONTROL_PRESETS.filter((p) => p.timeClass === "rapid").map((p) => p.id),
    classical: MAIA_TIME_CONTROL_PRESETS.filter((p) => p.timeClass === "classical").map((p) => p.id)
  };
  assert.deepEqual(byClass.blitz, ["3+0", "3+2", "5+0", "5+3"]);
  assert.deepEqual(byClass.rapid, ["10+0", "10+5", "15+0", "15+10"]);
  assert.deepEqual(byClass.classical, ["30+0", "30+20", "60+0", "unlimited"]);

  for (const preset of MAIA_TIME_CONTROL_PRESETS) {
    assert.equal(classifyMaiaTimeControl(preset.control), preset.timeClass);
  }

  // Bullet custom attempts are clamped up to Blitz minimum (180s estimated).
  const clamped = normalizeMaiaTimeControl({ initialMinutes: 1, incrementSeconds: 0, unlimited: false });
  assert.equal(clamped.initialMinutes, 3);
  assert.equal(classifyMaiaTimeControl(clamped), "blitz");
});

test("Glicko-2 rating updates start with large RD swings, support draws, and converge smoothly", () => {
  let rec = createDefaultMaiaRatingRecord("rapid", 1200, "2026-11-27T00:00:00.000Z");
  const firstWin = applyMaiaGameRatingResult(rec, "win", "2026-11-27T00:10:00.000Z");
  assert.ok(firstWin.change.ratingChange > 100, `Expected large initial win gain, got ${firstWin.change.ratingChange}`);
  assert.ok(firstWin.nextRecord.ratingDeviation < rec.ratingDeviation);
  assert.equal(firstWin.nextRecord.wins, 1);

  // Draw against same rating keeps rating steady while still shrinking RD.
  const drawRes = applyMaiaGameRatingResult(firstWin.nextRecord, "draw", "2026-11-27T00:20:00.000Z");
  assert.equal(drawRes.change.ratingChange, 0);
  assert.ok(drawRes.nextRecord.ratingDeviation < firstWin.nextRecord.ratingDeviation);
  assert.equal(drawRes.nextRecord.draws, 1);

  // After 15 alternating games, RD converges and single-game swing shrinks substantially.
  rec = drawRes.nextRecord;
  for (let i = 0; i < 15; i += 1) {
    rec = applyMaiaGameRatingResult(rec, i % 2 === 0 ? "win" : "loss", `2026-11-27T01:${String(i).padStart(2, "0")}:00.000Z`).nextRecord;
  }
  const lateWin = applyMaiaGameRatingResult(rec, "win", "2026-11-27T02:00:00.000Z");
  assert.ok(lateWin.change.ratingChange < 50, `Expected converged swing < 50, got ${lateWin.change.ratingChange}`);
  assert.ok(lateWin.nextRecord.ratingDeviation < 120);
});

test("Rated locks Maia to player rating; Unrated uses custom opponent rating", () => {
  const rated = createMaiaGameState({
    id: "g1",
    preferences: { ...DEFAULT_MAIA_SETUP_PREFERENCES, rated: true, opponentRating: 1900, colorPreference: "w" },
    userRating: 1350,
    nowMs: 1_000
  });
  assert.equal(rated.maiaRating, 1350);
  assert.equal(rated.userColor, "w");

  const unrated = createMaiaGameState({
    id: "g2",
    preferences: { ...DEFAULT_MAIA_SETUP_PREFERENCES, rated: false, opponentRating: 1800, colorPreference: "b" },
    userRating: 1350,
    nowMs: 1_000
  });
  assert.equal(unrated.maiaRating, 1800);
  assert.equal(unrated.userColor, "b");
});

test("handles pawn promotion (queen and knight underpromotion) and checkmate", () => {
  const base = createMaiaGameState({
    id: "promo",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 0, incrementSeconds: 0, unlimited: true },
      colorPreference: "w"
    },
    userRating: 1400,
    nowMs: 1000
  });
  // White pawn on e7, Black king on g8 + pawn on h7: e7e8n stays playing; vs bare king it auto-draws!
  const promoFen = "6k1/4P2p/4K3/8/8/8/8/8 w - - 0 1";
  const state: MaiaGameState = {
    ...base,
    initialFen: promoFen,
    currentFen: promoFen
  };
  assert.equal(isMaiaPromotionMove(promoFen, "e7", "e8"), true);
  assert.equal(isMaiaPromotionMove(promoFen, "e6", "d6"), false);

  const knightPromo = applyMaiaGameMove(state, "e7e8n", { nowMs: 2000 });
  assert.equal(knightPromo.move.uci, "e7e8n");
  assert.equal(knightPromo.move.san, "e8=N");
  assert.equal(knightPromo.state.status, "playing");

  // Underpromoting to knight against a bare king immediately triggers insufficient material draw
  const bareKingPromoFen = "6k1/4P3/4K3/8/8/8/8/8 w - - 0 1";
  const bareKingPromo = applyMaiaGameMove(
    { ...base, initialFen: bareKingPromoFen, currentFen: bareKingPromoFen },
    "e7e8n",
    { nowMs: 2000 }
  );
  assert.equal(bareKingPromo.state.status, "finished");
  assert.equal(bareKingPromo.state.endReason, "insufficient_material");

  // Fool's mate checkmate detection
  let game = createMaiaGameState({
    id: "mate",
    preferences: { ...DEFAULT_MAIA_SETUP_PREFERENCES, colorPreference: "w" },
    userRating: 1200,
    nowMs: 10_000
  });
  game = applyMaiaGameMove(game, "f2f3", { nowMs: 11_000 }).state;
  game = applyMaiaGameMove(game, "e7e5", { nowMs: 12_000 }).state;
  game = applyMaiaGameMove(game, "g2g4", { nowMs: 13_000 }).state;
  game = applyMaiaGameMove(game, "d8h4", { nowMs: 14_000 }).state;
  assert.equal(game.status, "finished");
  assert.equal(game.winner, "b");
  assert.equal(game.endReason, "checkmate");
  assert.equal(maiaGameOutcomeForUser(game), "loss");
});

test("handles stalemate, insufficient material, threefold repetition, and fifty-move rule draws", () => {
  const base = createMaiaGameState({
    id: "draws",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 0, incrementSeconds: 0, unlimited: true },
      colorPreference: "w"
    },
    userRating: 1200,
    nowMs: 1_000
  });

  // 1. Stalemate: Black king h8, White king f7, White queen g5 -> Qg6 is stalemate
  const stalemateStart = "7k/5K2/8/6Q1/8/8/8/8 w - - 0 1";
  const stalemateRes = applyMaiaGameMove(
    { ...base, initialFen: stalemateStart, currentFen: stalemateStart },
    "g5g6",
    { nowMs: 2_000 }
  );
  assert.equal(stalemateRes.state.status, "finished");
  assert.equal(stalemateRes.state.winner, "none");
  assert.equal(stalemateRes.state.endReason, "stalemate");

  // 2. Insufficient material: K+R vs K+N -> KxR leaves K vs K+N (draw)
  const insuffStart = "4k3/8/8/8/8/8/4r3/4KN2 w - - 0 1";
  const insuffRes = applyMaiaGameMove(
    { ...base, initialFen: insuffStart, currentFen: insuffStart },
    "e1e2",
    { nowMs: 2_000 }
  );
  assert.equal(insuffRes.state.status, "finished");
  assert.equal(insuffRes.state.winner, "none");
  assert.equal(insuffRes.state.endReason, "insufficient_material");

  // 3. Threefold repetition via full move replay
  let rep = createMaiaGameState({
    id: "rep",
    preferences: { ...DEFAULT_MAIA_SETUP_PREFERENCES, colorPreference: "w" },
    userRating: 1200,
    nowMs: 1_000
  });
  const repMoves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
  for (let i = 0; i < repMoves.length; i += 1) {
    rep = applyMaiaGameMove(rep, repMoves[i]!, { nowMs: 2_000 + i * 1_000 }).state;
  }
  assert.equal(rep.status, "finished");
  assert.equal(rep.winner, "none");
  assert.equal(rep.endReason, "threefold_repetition");

  // 4. Fifty-move rule (halfmove clock reaches 100)
  const fiftyStart = "4k2r/8/8/8/8/8/R7/4K3 w - - 99 60";
  const fiftyRes = applyMaiaGameMove(
    { ...base, initialFen: fiftyStart, currentFen: fiftyStart },
    "a2a3",
    { nowMs: 2_000 }
  );
  assert.equal(fiftyRes.state.status, "finished");
  assert.equal(fiftyRes.state.winner, "none");
  assert.equal(fiftyRes.state.endReason, "fifty_move_rule");
});

test("handles timeout vs insufficient material accurately across endgame combinations", () => {
  // Bare king cannot win on time even vs Queen
  assert.equal(hasInsufficientMaterialToWinOnTime("4k2q/8/8/8/8/8/8/4K3 w - - 0 1", "w"), true);
  // Single knight cannot win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/7p/8/8/8/8/8/4KN2 w - - 0 1", "w"), true);
  // Single bishop cannot win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/7p/8/8/8/8/8/4KB2 w - - 0 1", "w"), true);
  // Two same-color bishops cannot win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/8/8/8/8/8/2B5/4KB2 w - - 0 1", "w"), true);
  // Two knights vs bare king cannot win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/8/8/8/8/8/8/3NKN2 w - - 0 1", "w"), true);

  // Pawn CAN win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", "w"), false);
  // Opposite-color bishops (c1 dark + f1 light) CAN win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1", "w"), false);
  // Bishop + Knight CAN win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/8/8/8/8/8/8/3BKN2 w - - 0 1", "w"), false);
  // Two knights vs King+Pawn CAN win on time
  assert.equal(hasInsufficientMaterialToWinOnTime("4k3/4p3/8/8/8/8/8/3NKN2 w - - 0 1", "w"), false);

  // End-to-end resolveMaiaTimeout: Black flags while White only has bare King -> Draw!
  const timedBase = createMaiaGameState({
    id: "timeout-insuff",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 3, incrementSeconds: 0, unlimited: false },
      colorPreference: "w"
    },
    userRating: 1200,
    nowMs: 1_000
  });
  const blackFlagsVsBareKing: MaiaGameState = {
    ...timedBase,
    initialFen: "4k2q/8/8/8/8/8/8/4K3 b - - 0 1",
    currentFen: "4k2q/8/8/8/8/8/8/4K3 b - - 0 1",
    clocksMs: { w: 120_000, b: 1_000 },
    turnStartedAtMs: 1_000
  };
  const resolvedDraw = resolveMaiaTimeout(blackFlagsVsBareKing, "b", 5_000);
  assert.equal(resolvedDraw.status, "finished");
  assert.equal(resolvedDraw.winner, "none");
  assert.equal(resolvedDraw.endReason, "timeout_vs_insufficient_material");
  assert.equal(resolvedDraw.clocksMs?.b, 0);

  // White has a pawn when Black flags -> White wins on time!
  const blackFlagsVsPawn: MaiaGameState = {
    ...timedBase,
    initialFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
    currentFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
    clocksMs: { w: 120_000, b: 1_000 },
    turnStartedAtMs: 1_000
  };
  const resolvedWin = resolveMaiaTimeout(blackFlagsVsPawn, "b", 5_000);
  assert.equal(resolvedWin.status, "finished");
  assert.equal(resolvedWin.winner, "w");
  assert.equal(resolvedWin.endReason, "timeout");
});

test("abort, resign, draw offer anti-farming, pause/resume clocks, and PGN round-trip", () => {
  let game = createMaiaGameState({
    id: "flow1",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 5, incrementSeconds: 3, unlimited: false },
      colorPreference: "w"
    },
    userRating: 1450,
    nowMs: 10_000
  });
  assert.equal(canAbortMaiaGame(game), true);

  // Move 1 by White -> still < 2 plies -> can still abort
  game = applyMaiaGameMove(game, "e2e4", { nowMs: 12_000 }).state;
  assert.equal(canAbortMaiaGame(game), true);

  // Pause and resume clock preserves exact remaining ms
  const paused = pauseMaiaGameClock(game, 15_000);
  assert.equal(paused.turnStartedAtMs, null);
  assert.equal(paused.clocksMs?.b, 300_000 - 3_000);
  const resumed = resumeMaiaGameClock(paused, 50_000);
  assert.equal(computeLiveMaiaClocksMs(resumed, 52_000)?.b, 300_000 - 5_000);

  // Move 2 by Black -> now >= 2 plies -> cannot abort, early draw offer declined
  game = applyMaiaGameMove(game, "e7e5", { nowMs: 16_000 }).state;
  assert.equal(canAbortMaiaGame(game), false);
  const earlyDraw = offerDrawToMaia(game);
  assert.equal(earlyDraw.accepted, false);
  assert.equal(earlyDraw.state.drawDeclinedAtPly, 2);

  // Toggle pace mid-game
  game = setMaiaGameThinkingPace(game, "instant");
  assert.equal(game.thinkingPace, "instant");

  // Resign and verify PGN round-trip through Game Review parser
  const resigned = resignMaiaGame(game, "2026-11-27T19:30:00.000Z");
  assert.equal(resigned.status, "finished");
  assert.equal(resigned.winner, "b");
  assert.equal(resigned.endReason, "resign");

  const draft = buildImportedGameDraftFromMaiaGame(resigned);
  assert.equal(draft.platform, "maia");
  assert.equal(draft.timeClass, "blitz");
  assert.equal(draft.timeControl, "300+3");
  assert.equal(draft.black.isAi, true);
  assert.equal(draft.black.rating, 1450);

  const parsed = parsePgnGame(draft.pgn);
  assert.equal(parsed.plies.length, 2);
  assert.equal(parsed.plies[0]?.san, "e4");
  assert.equal(parsed.plies[1]?.san, "e5");
  assert.ok(parsed.plies[0]?.clockRemainingSec !== undefined);

  // Abort produces aborted status
  const fresh = createMaiaGameState({
    id: "abort1",
    preferences: DEFAULT_MAIA_SETUP_PREFERENCES,
    userRating: 1200
  });
  const aborted = abortMaiaGame(fresh);
  assert.equal(aborted.status, "aborted");
  assert.equal(aborted.endReason, "aborted");
});

test("selectMaiaMove uses HumanPolicyModel when present, falls back cleanly, and computes human think time", async () => {
  const fakePolicy: HumanPolicyModel = {
    async scoreMoves(requests) {
      return requests.map((req) => {
        const probs: Record<string, number> = {};
        for (const move of req.moves) {
          probs[move] = move === "e2e4" ? 0.9 : 0.1 / Math.max(1, req.moves.length - 1);
        }
        return {
          byElo: Object.fromEntries(
            req.elos.map((elo) => [
              elo,
              { probs, top1Prob: 0.9, entropy: 0.45 }
            ])
          )
        };
      });
    }
  };

  const picked = await selectMaiaMove({
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    maiaRating: 1500,
    policyModel: fakePolicy,
    disableOpeningBook: true,
    rng: () => 0.1
  });
  assert.equal(picked.uci, "e2e4");
  assert.equal(picked.usedFallbackPolicy, false);

  // Opening book serves realistic human openings on move 1 (preventing Maia-2's ply < 10 OOD knight shuffling)
  const bookPick = await selectMaiaMove({
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    maiaRating: 1500,
    policyModel: fakePolicy,
    rng: () => 0.1
  });
  assert.equal(bookPick.usedOpeningBook, true);
  assert.ok(["e2e4", "d2d4", "g1f3", "c2c4"].includes(bookPick.uci));

  // Out-of-book opening guard suppresses Maia-2's ply < 10 Nb1 retreat artifact (1. Nc3 Nf6)
  const trapPolicy: HumanPolicyModel = {
    async scoreMoves(requests) {
      return requests.map((req) => {
        const probs: Record<string, number> = {};
        for (const move of req.moves) {
          probs[move] = move === "c3b1" ? 0.79 : move === "g1f3" ? 0.08 : move === "d2d4" ? 0.07 : 0.06 / Math.max(1, req.moves.length - 3);
        }
        return {
          byElo: Object.fromEntries(req.elos.map((elo) => [elo, { probs, top1Prob: 0.79, entropy: 0.9 }]))
        };
      });
    }
  };
  const guardedPick = await selectMaiaMove({
    fen: "rnbqkb1r/pppppppp/5n2/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 2 2",
    maiaRating: 1450,
    ply: 2,
    recentPositionKeys: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"],
    policyModel: trapPolicy,
    rng: () => 0.2
  });
  assert.notEqual(guardedPick.uci, "c3b1");

  const fallbackPicked = await selectMaiaMove({
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    maiaRating: 1200,
    policyModel: null,
    disableOpeningBook: true,
    rng: () => 0.2
  });
  assert.equal(fallbackPicked.usedFallbackPolicy, true);
  assert.ok(fallbackPicked.uci.length >= 4);

  // Instant pace -> 0ms
  assert.equal(
    computeMaiaThinkTimeMs({
      thinkingPace: "instant",
      timeClass: "rapid",
      ply: 14,
      top1Prob: 0.3,
      entropy: 2.1,
      legalMoveCount: 30,
      maiaClockRemainingMs: 500_000
    }),
    0
  );

  // Human pace in complex middlegame takes longer than obvious forced move, and respects time trouble
  const complexMs = computeMaiaThinkTimeMs({
    thinkingPace: "human",
    timeClass: "rapid",
    ply: 20,
    top1Prob: 0.22,
    entropy: 2.8,
    legalMoveCount: 32,
    maiaClockRemainingMs: 500_000,
    rng: () => 0.5
  });
  const forcedMs = computeMaiaThinkTimeMs({
    thinkingPace: "human",
    timeClass: "rapid",
    ply: 20,
    top1Prob: 0.95,
    entropy: 0.2,
    legalMoveCount: 32,
    maiaClockRemainingMs: 500_000,
    rng: () => 0.5
  });
  const scrambleMs = computeMaiaThinkTimeMs({
    thinkingPace: "human",
    timeClass: "blitz",
    ply: 40,
    top1Prob: 0.25,
    entropy: 2.5,
    legalMoveCount: 30,
    maiaClockRemainingMs: 5_000,
    rng: () => 0.5
  });
  assert.ok(complexMs > forcedMs, `Expected complex (${complexMs}) > forced (${forcedMs})`);
  assert.ok(scrambleMs <= 600, `Expected scramble think time <= 600ms, got ${scrambleMs}`);

  // Suggest initial rating picks matching timeClass first
  assert.equal(
    suggestInitialMaiaRating({
      timeClass: "rapid",
      importedGameRatings: { blitz: 1120, rapid: 1480 },
      sprintRating: 900
    }),
    1500
  );
});

test("recomputeMaiaRatingFromGames converges identically across all out-of-order permutations and duplicates", () => {
  const anchor = preferredMaiaRatingAnchor(
    { timeClass: "rapid", initialRating: 1500, setAt: "2026-11-27T09:05:00.000Z" },
    { timeClass: "rapid", initialRating: 1400, setAt: "2026-11-27T09:00:00.000Z" }
  );
  assert.equal(anchor.initialRating, 1400);
  assert.equal(anchor.setAt, "2026-11-27T09:00:00.000Z");

  // Same timestamp tie-breaks deterministically toward lower initialRating
  const tied = preferredMaiaRatingAnchor(
    { timeClass: "rapid", initialRating: 1600, setAt: "2026-11-27T09:00:00.000Z" },
    { timeClass: "rapid", initialRating: 1300, setAt: "2026-11-27T09:00:00.000Z" }
  );
  assert.equal(tied.initialRating, 1300);

  const games: MaiaRatedGameRecord[] = [
    {
      gameId: "maia-g1",
      timeClass: "rapid",
      outcome: "win",
      opponentRating: 1400,
      playedAt: "2026-11-27T10:00:00.000Z",
      initialRatingAnchor: 1400
    },
    {
      gameId: "maia-g2",
      timeClass: "rapid",
      outcome: "loss",
      opponentRating: 1400,
      playedAt: "2026-11-27T10:10:00.000Z",
      initialRatingAnchor: 1400
    },
    {
      gameId: "maia-g3",
      timeClass: "rapid",
      outcome: "draw",
      opponentRating: 1400,
      playedAt: "2026-11-27T10:10:00.000Z",
      initialRatingAnchor: 1400
    },
    {
      gameId: "maia-g4",
      timeClass: "rapid",
      outcome: "win",
      opponentRating: 1400,
      playedAt: "2026-11-27T10:30:00.000Z",
      initialRatingAnchor: 1400
    }
  ];

  // Expected sequential replay in canonical (playedAt, gameId) order
  let expected = createDefaultMaiaRatingRecord("rapid", 1400, anchor.setAt);
  for (const g of games) {
    expected = applyMaiaGameRatingResult(expected, g.outcome, g.playedAt, g.opponentRating).nextRecord;
  }

  // Test all 24 permutations + injected duplicates + unrelated timeClass noise
  function permute<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += 1) {
      const rest = [...items.slice(0, i), ...items.slice(i + 1)];
      for (const tail of permute(rest)) {
        out.push([items[i]!, ...tail]);
      }
    }
    return out;
  }

  const blitzNoise: MaiaRatedGameRecord = {
    gameId: "maia-blitz-1",
    timeClass: "blitz",
    outcome: "loss",
    opponentRating: 1200,
    playedAt: "2026-11-27T10:05:00.000Z",
    initialRatingAnchor: 1200
  };

  for (const perm of permute(games)) {
    const recomputed = recomputeMaiaRatingFromGames({
      timeClass: "rapid",
      anchor,
      ratedGames: [...perm, games[1]!, blitzNoise]
    });
    assert.deepEqual(recomputed, expected);
  }
});
