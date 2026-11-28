process.env.TZ = "UTC";
import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  USER_GAME_PUZZLE_ID_PREFIX,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  continueArrowDuelReplyLine,
  isUserGamePuzzleId,
  submitArrowDuelChoice,
  submitArrowDuelReply,
  submitLineMove,
  type ExtractedGamePuzzle,
  type GamePlyEvaluation,
  type ImportedGameDraft,
  type Puzzle
} from "../../core/src/index.ts";
import {
  CURRENT_SCHEMA_VERSION,
  CompositePuzzleSource,
  FakeProgressV2Transport,
  MemoryStore,
  NodeSqliteDatabase,
  PackBackedPracticeStore,
  PracticeService,
  SQLitePuzzlePackSource,
  SQLiteStore,
  canonicalJson,
  gamePlyEvaluationFromStored,
  progressV2RecordName,
  reviewEntityKey,
  storedGamePlyEvalFromEvaluation,
  storedUserPuzzleToPuzzle,
  syncPracticeProgressV2,
  type PracticeStore,
  type ProgressV2Record,
  type StoredGamePlyEval
} from "../src/index.ts";

const RELEASED_IOS_121_FIXTURE = resolve(
  "packages/storage/test/fixtures/migrations/schema-v8-ios-1.2.1.sqlite"
);

// Legal chess position (White to move):
// After 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5
// White blundering 5. Nxf7 allows 5... Qxg2 6. Rf1 Qxe4+
// Actually let's use simple, rock-solid legal positions verified by chess.js!

// Line puzzle: Fool's mate setup!
// initialFen: position before White's blunder 2. g4 (auto-played setupMove "g2g4"),
// then Black plays 2... Qh4# ("d8h4").
const LINE_PUZZLE_INITIAL_FEN =
  "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2";
const LINE_PUZZLE_MOVES = ["g2g4", "d8h4"];

// Arrow Duel puzzle: White to move on move 2 after 1. f3 e5!
// decisionFen: White to move. Blunder: "g2g4" allows punishmentLine ["d8h4"].
// Best move: "e2e4" (safe development).
const ARROW_DUEL_DECISION_FEN =
  "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2";
const ARROW_DUEL_BEST_MOVE = "e2e4";
const ARROW_DUEL_BLUNDER_MOVE = "g2g4";
const ARROW_DUEL_PUNISHMENT_LINE = ["d8h4"];

// Second line puzzle (different FEN / game) for filtering tests:
// After 1. e4 e5 2. Qh5 g6?? (setupMove "g7g6"), White wins the rook with 3. Qxe5+ ("h5e5") 3... Qe7 ("d8e7") 4. Qxh8 ("e5h8").
const LINE_PUZZLE_2_INITIAL_FEN =
  "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2";
const LINE_PUZZLE_2_MOVES = ["g7g6", "h5e5", "d8e7", "e5h8"];

const PACK_PUZZLE_1: Puzzle = {
  id: "00001",
  initialFen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
  solutionMoves: ["g7g6", "d1d8"],
  rating: 1200,
  themes: ["backRankMate", "endgame"],
  source: "lichess",
  stockfishEval: 50,
  stockfishBestMove: "h7h6",
  stockfishEvalAfterFirstMove: 900
};

const PACK_PUZZLE_2: Puzzle = {
  id: "00002",
  initialFen: "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
  solutionMoves: ["e1e8"],
  rating: 1250,
  themes: ["backRankMate"],
  source: "lichess"
};

function makeImportedGame(overrides: Partial<ImportedGameDraft> = {}): ImportedGameDraft {
  return {
    id: overrides.id ?? "chess_com:live:1001",
    platform: overrides.platform ?? "chess_com",
    username: overrides.username ?? "alice",
    userColor: overrides.userColor ?? "b",
    playedAt: overrides.playedAt ?? "2026-10-01T12:00:00.000Z",
    timeControl: overrides.timeControl ?? "300+0",
    timeClass: overrides.timeClass ?? "blitz",
    rated: overrides.rated ?? true,
    ...(overrides.url === undefined ? { url: "https://www.chess.com/game/live/1001" } : { url: overrides.url }),
    white: overrides.white ?? { username: "bob", rating: 1480, isAi: false },
    black: overrides.black ?? { username: "alice", rating: 1520, isAi: false },
    winner: overrides.winner ?? "b",
    termination: overrides.termination ?? "mate",
    ...(overrides.eco === undefined ? { eco: "A00" } : { eco: overrides.eco }),
    ...(overrides.opening === undefined ? { opening: "Barnes Opening" } : { opening: overrides.opening }),
    pgn: overrides.pgn ?? "1. f3 e5 2. g4 Qh4# 0-1"
  };
}

function makeExtractedLinePuzzle(
  gameId: string,
  overrides: Partial<ExtractedGamePuzzle> = {}
): ExtractedGamePuzzle {
  return {
    idSeed: overrides.idSeed ?? `${gameId}:3:line:opponent_mistake_missed:pos1`,
    ply: overrides.ply ?? 3,
    moveNumber: overrides.moveNumber ?? 2,
    puzzleKind: "line",
    momentKind: overrides.momentKind ?? "opponent_mistake_missed",
    userColor: overrides.userColor ?? "b",
    puzzleColor: overrides.puzzleColor ?? "b",
    initialFen: overrides.initialFen ?? LINE_PUZZLE_INITIAL_FEN,
    solutionMoves: overrides.solutionMoves ?? [...LINE_PUZZLE_MOVES],
    prevCp: overrides.prevCp ?? -30,
    cp: overrides.cp ?? 10000,
    winChanceSwing: overrides.winChanceSwing ?? 0.55,
    themes: overrides.themes ?? ["mateIn1", "opening"],
    lengthTag: overrides.lengthTag ?? "oneMove",
    phaseTag: overrides.phaseTag ?? "opening",
    clockRemainingSec: overrides.clockRemainingSec ?? 285,
    timeSpentSec: overrides.timeSpentSec ?? 6,
    caliberScore: overrides.caliberScore ?? 88.5
  };
}

function makeExtractedArrowDuelPuzzle(
  gameId: string,
  overrides: Partial<ExtractedGamePuzzle> = {}
): ExtractedGamePuzzle {
  return {
    idSeed: overrides.idSeed ?? `${gameId}:3:arrow_duel:own_blunder_punished:pos1`,
    ply: overrides.ply ?? 3,
    moveNumber: overrides.moveNumber ?? 2,
    puzzleKind: "arrow_duel",
    momentKind: overrides.momentKind ?? "own_blunder_punished",
    userColor: overrides.userColor ?? "w",
    puzzleColor: overrides.puzzleColor ?? "w",
    initialFen: overrides.initialFen ?? ARROW_DUEL_DECISION_FEN,
    solutionMoves: overrides.solutionMoves ?? [
      ARROW_DUEL_BLUNDER_MOVE,
      ...ARROW_DUEL_PUNISHMENT_LINE
    ],
    prevCp: overrides.prevCp ?? -20,
    cp: overrides.cp ?? 10000,
    winChanceSwing: overrides.winChanceSwing ?? 0.62,
    arrowDuel: overrides.arrowDuel ?? {
      bestMove: ARROW_DUEL_BEST_MOVE,
      blunderMove: ARROW_DUEL_BLUNDER_MOVE,
      bestEvalWhite: -20,
      blunderEvalWhite: -10000,
      punishmentLine: [...ARROW_DUEL_PUNISHMENT_LINE],
      decisionFen: ARROW_DUEL_DECISION_FEN
    },
    themes: overrides.themes ?? ["hangingPiece", "opening"],
    lengthTag: overrides.lengthTag ?? "oneMove",
    phaseTag: overrides.phaseTag ?? "opening",
    clockRemainingSec: overrides.clockRemainingSec ?? 290,
    timeSpentSec: overrides.timeSpentSec ?? 4,
    caliberScore: overrides.caliberScore ?? 92.25
  };
}

function makeSamplePlyEvals(gameId: string): StoredGamePlyEval[] {
  const ply1: GamePlyEvaluation = {
    ply: 1,
    moveNumber: 1,
    color: "w",
    uci: "f2f3",
    san: "f3",
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
    scoreAfter: { kind: "cp", whiteCentipawns: -60, sideToMoveCentipawns: 60 },
    whiteWinPercent: 44.5,
    moverWinPercentBefore: 52.0,
    moverWinPercentAfter: 44.5,
    winPercentLoss: 7.5,
    bestMove: "e2e4",
    classification: "inaccuracy",
    clockRemainingSec: 298,
    timeSpentSec: 2,
    clockBucket: "impulsive",
    isKeyMomentCandidate: false,
    fromPreExistingEval: false
  };
  const ply2: GamePlyEvaluation = {
    ply: 2,
    moveNumber: 1,
    color: "b",
    uci: "e7e5",
    san: "e5",
    fenBefore: ply1.fenAfter,
    fenAfter: LINE_PUZZLE_INITIAL_FEN,
    scoreAfter: { kind: "cp", whiteCentipawns: -55, sideToMoveCentipawns: -55 },
    whiteWinPercent: 45.0,
    moverWinPercentBefore: 55.5,
    moverWinPercentAfter: 55.0,
    winPercentLoss: 0.5,
    bestMove: "e7e5",
    classification: "best",
    clockRemainingSec: 295,
    timeSpentSec: 5,
    clockBucket: "deliberate",
    isKeyMomentCandidate: false,
    fromPreExistingEval: false
  };
  const ply3: GamePlyEvaluation = {
    ply: 3,
    moveNumber: 2,
    color: "w",
    uci: "g2g4",
    san: "g4",
    fenBefore: LINE_PUZZLE_INITIAL_FEN,
    fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    scoreAfter: { kind: "mate", whiteMate: -1, sideToMoveMate: 1 },
    whiteWinPercent: 0,
    moverWinPercentBefore: 45.0,
    moverWinPercentAfter: 0,
    winPercentLoss: 45.0,
    bestMove: "e2e4",
    classification: "blunder",
    clockRemainingSec: 290,
    timeSpentSec: 8,
    clockBucket: "deliberate",
    isKeyMomentCandidate: true,
    fromPreExistingEval: false
  };
  return [
    storedGamePlyEvalFromEvaluation(gameId, ply1, false),
    storedGamePlyEvalFromEvaluation(gameId, ply2, false),
    storedGamePlyEvalFromEvaluation(gameId, ply3, true)
  ];
}

function createPackSourceDatabase(puzzles: readonly Puzzle[]): {
  db: DatabaseSync;
  source: SQLitePuzzlePackSource;
} {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pack_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO pack_metadata (key, value) VALUES ('row_encoding', 'text');
    CREATE TABLE themes (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE puzzles (
      id TEXT PRIMARY KEY,
      initial_fen TEXT NOT NULL,
      solution_moves TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rating_deviation INTEGER NOT NULL,
      stockfish_eval REAL NOT NULL,
      stockfish_bestmove TEXT NOT NULL,
      stockfish_eval_after_first_move REAL NOT NULL
    );
    CREATE TABLE puzzle_themes (
      theme_id INTEGER NOT NULL,
      puzzle_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      PRIMARY KEY (theme_id, puzzle_id)
    );
  `);
  const insertTheme = db.prepare("INSERT OR IGNORE INTO themes (name) VALUES (?)");
  const getThemeId = db.prepare("SELECT id FROM themes WHERE name = ?");
  const insertPuzzle = db.prepare(`
    INSERT INTO puzzles (
      id, initial_fen, solution_moves, rating, rating_deviation,
      stockfish_eval, stockfish_bestmove, stockfish_eval_after_first_move
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPuzzleTheme = db.prepare(
    "INSERT INTO puzzle_themes (theme_id, puzzle_id, rating) VALUES (?, ?, ?)"
  );
  for (const puzzle of puzzles) {
    insertPuzzle.run(
      puzzle.id,
      puzzle.initialFen,
      puzzle.solutionMoves.join(" "),
      puzzle.rating,
      puzzle.ratingDeviation ?? 75,
      puzzle.stockfishEval ?? 0,
      puzzle.stockfishBestMove ?? "",
      puzzle.stockfishEvalAfterFirstMove ?? 0
    );
    for (const theme of puzzle.themes) {
      insertTheme.run(theme);
      const row = getThemeId.get(theme) as { id: number };
      insertPuzzleTheme.run(row.id, puzzle.id, puzzle.rating);
    }
  }
  return { db, source: new SQLitePuzzlePackSource(new NodeSqliteDatabase(db)) };
}

function runStoreContractSuite(
  label: string,
  createStore: () => Promise<{
    store: PracticeStore;
    reopen?: () => Promise<PracticeStore>;
    cleanup: () => Promise<void>;
  }>
) {
  test(`${label}: linked accounts CRUD and case-insensitive upsert`, async () => {
    const ctx = await createStore();
    try {
      let store = ctx.store;
      assert.deepEqual(store.listLinkedAccounts(), []);

      const created = store.upsertLinkedAccount({
        platform: "chess_com",
        username: "AliceChess",
        createdAt: "2026-10-01T00:00:00.000Z"
      });
      assert.deepEqual(created, {
        platform: "chess_com",
        username: "AliceChess",
        createdAt: "2026-10-01T00:00:00.000Z"
      });

      const updated = store.upsertLinkedAccount({
        platform: "chess_com",
        username: "alicechess",
        lastSyncedAt: "2026-10-02T10:00:00.000Z"
      });
      assert.equal(updated.createdAt, "2026-10-01T00:00:00.000Z");
      assert.equal(updated.lastSyncedAt, "2026-10-02T10:00:00.000Z");
      assert.equal(store.listLinkedAccounts().length, 1);

      store.upsertLinkedAccount({
        platform: "lichess",
        username: "alice_li",
        createdAt: "2026-10-01T01:00:00.000Z"
      });
      assert.equal(store.listLinkedAccounts().length, 2);

      if (ctx.reopen) {
        store = await ctx.reopen();
        assert.equal(store.listLinkedAccounts().length, 2);
      }

      store.removeLinkedAccount("chess_com", "ALICECHESS");
      assert.deepEqual(
        store.listLinkedAccounts().map((account) => `${account.platform}:${account.username}`),
        ["lichess:alice_li"]
      );
    } finally {
      await ctx.cleanup();
    }
  });

  test(`${label}: batch game upsert deduplicates and preserves prior analysis state`, async () => {
    const ctx = await createStore();
    try {
      let store = ctx.store;
      const g1 = makeImportedGame({
        id: "chess_com:live:1",
        playedAt: "2026-10-01T12:00:00.000Z",
        timeClass: "blitz"
      });
      const g2 = makeImportedGame({
        id: "lichess:abcd1234",
        platform: "lichess",
        playedAt: "2026-10-02T12:00:00.000Z",
        timeClass: "rapid",
        url: "https://lichess.org/abcd1234"
      });

      // Duplicate inside the same batch should be skipped cleanly.
      const first = store.upsertImportedGames([g1, g1, g2], "2026-10-03T00:00:00.000Z");
      assert.deepEqual(first, { inserted: 2, skipped: 1, updated: 0 });
      assert.equal(store.countImportedGames(), 2);

      // Save Pass-1 checkpoint & accuracy on g1.
      const evals = makeSamplePlyEvals(g1.id);
      store.saveGamePlyEvaluations(g1.id, evals.slice(0, 2), {
        analysisStatus: "partial",
        analysisCheckpointPly: 2,
        whiteAccuracy: 74.5,
        blackAccuracy: 92.1,
        updatedAt: "2026-10-03T01:00:00.000Z"
      });
      store.replaceGameUserPuzzles(g1.id, [makeExtractedLinePuzzle(g1.id)], {
        nowIso: "2026-10-03T01:05:00.000Z"
      });

      // Re-importing identical batch creates zero duplicates and skips all.
      const second = store.upsertImportedGames([g1, g2], "2026-10-04T00:00:00.000Z");
      assert.deepEqual(second, { inserted: 0, skipped: 2, updated: 0 });

      // Re-importing with updated metadata updates metadata ONLY without wiping analysis!
      const g1Updated = { ...g1, opening: "Barnes Opening: Fool's Mate", eco: "A00" };
      const third = store.upsertImportedGames([g1Updated], "2026-10-05T00:00:00.000Z");
      assert.deepEqual(third, { inserted: 0, skipped: 0, updated: 1 });

      if (ctx.reopen) {
        store = await ctx.reopen();
      }

      const reloaded = store.getImportedGame(g1.id);
      assert.ok(reloaded);
      assert.equal(reloaded.opening, "Barnes Opening: Fool's Mate");
      assert.equal(reloaded.analysisStatus, "partial");
      assert.equal(reloaded.analysisCheckpointPly, 2);
      assert.equal(reloaded.whiteAccuracy, 74.5);
      assert.equal(reloaded.blackAccuracy, 92.1);
      assert.equal(reloaded.puzzleCount, 1);
      assert.equal(store.listGamePlyEvaluations(g1.id).length, 2);

      // Filters & pagination:
      store.saveGamePlyEvaluations(g2.id, makeSamplePlyEvals(g2.id), {
        analysisStatus: "complete",
        analysisCheckpointPly: 3,
        whiteAccuracy: 81,
        blackAccuracy: 89
      });
      assert.equal(store.countImportedGames({ platform: "lichess" }), 1);
      assert.equal(store.countImportedGames({ timeClass: "rapid" }), 1);
      assert.equal(store.countImportedGames({ analysisStatus: "analyzed" }), 1);
      assert.equal(store.countImportedGames({ analysisStatus: "unanalyzed" }), 1);
      assert.equal(store.countImportedGames({ analysisStatus: "partial" }), 1);
      assert.deepEqual(
        store.listImportedGames({ limit: 1, offset: 0 }).map((g) => g.id),
        [g2.id]
      );
      assert.deepEqual(
        store.listImportedGames({ limit: 1, offset: 1 }).map((g) => g.id),
        [g1.id]
      );
    } finally {
      await ctx.cleanup();
    }
  });

  test(`${label}: checkpoint save/resume, idempotent re-analysis, and exact Puzzle session mapping`, async () => {
    const ctx = await createStore();
    try {
      let store = ctx.store;
      const g1 = makeImportedGame({ id: "chess_com:live:42", userColor: "w" });
      store.upsertImportedGames([g1], "2026-10-01T00:00:00.000Z");

      // Save checkpoint plies 1..2, then resume with ply 3.
      const allEvals = makeSamplePlyEvals(g1.id);
      store.saveGamePlyEvaluations(g1.id, allEvals.slice(0, 2), {
        analysisStatus: "partial",
        analysisCheckpointPly: 2
      });
      assert.equal(store.listGamePlyEvaluations(g1.id).length, 2);

      store.saveGamePlyEvaluations(g1.id, [allEvals[2]!], {
        analysisStatus: "complete",
        analysisCheckpointPly: 3,
        whiteAccuracy: 68.4,
        blackAccuracy: 95.2
      });
      const storedEvals = store.listGamePlyEvaluations(g1.id);
      assert.equal(storedEvals.length, 3);
      assert.equal(storedEvals[2]!.evalKind, "mate");
      assert.equal(storedEvals[2]!.whiteScore, -1);
      assert.equal(storedEvals[2]!.deepVerified, true);
      const roundTripped = gamePlyEvaluationFromStored(storedEvals[2]!);
      assert.deepEqual(roundTripped.scoreAfter, {
        kind: "mate",
        whiteMate: -1,
        sideToMoveMate: 1
      });

      // Extract BOTH a line puzzle and an arrow_duel puzzle.
      const lineExtracted = makeExtractedLinePuzzle(g1.id);
      const arrowExtracted = makeExtractedArrowDuelPuzzle(g1.id);
      const saved = store.replaceGameUserPuzzles(
        g1.id,
        [lineExtracted, arrowExtracted],
        { nowIso: "2026-10-02T00:00:00.000Z" }
      );
      assert.equal(saved.length, 2);
      assert.ok(saved.every((p) => isUserGamePuzzleId(p.id)));
      assert.ok(saved.every((p) => p.id.startsWith(USER_GAME_PUZZLE_ID_PREFIX)));

      const lineStored = saved.find((p) => p.puzzleKind === "line")!;
      const arrowStored = saved.find((p) => p.puzzleKind === "arrow_duel")!;

      // Verify exact fidelity with beginLinePuzzle + submitLineMove!
      const linePuzzle = storedUserPuzzleToPuzzle(lineStored);
      assert.equal(linePuzzle.source, "user_game");
      assert.equal(linePuzzle.userGameMeta?.gameId, g1.id);
      assert.equal(linePuzzle.userGameMeta?.opponentName, "alice");
      assert.equal(linePuzzle.userGameMeta?.timeClass, "blitz");
      assert.equal(linePuzzle.stockfishBestMove, undefined);
      const lineState = beginLinePuzzle(linePuzzle);
      assert.deepEqual(lineState.autoPlayedMoves, ["g2g4"]);
      const lineSubmit = submitLineMove(lineState, "d8h4");
      assert.equal(lineSubmit.feedback.result, "correct");
      assert.equal(lineSubmit.feedback.puzzleSolved, true);

      // Verify exact fidelity with beginArrowDuelPuzzle + submitArrowDuelChoice + submitArrowDuelReply + continueArrowDuelReplyLine!
      const arrowPuzzle = storedUserPuzzleToPuzzle(arrowStored);
      assert.equal(arrowPuzzle.source, "user_game");
      assert.equal(arrowPuzzle.initialFen, ARROW_DUEL_DECISION_FEN);
      assert.equal(arrowPuzzle.stockfishBestMove, ARROW_DUEL_BEST_MOVE);
      assert.equal(arrowPuzzle.solutionMoves[0], ARROW_DUEL_BLUNDER_MOVE);
      assert.equal(arrowPuzzle.solutionMoves[1], "d8h4");
      assert.equal(arrowPuzzle.stockfishEval, -20);
      assert.equal(arrowPuzzle.stockfishEvalAfterFirstMove, -10000);
      assert.deepEqual(arrowPuzzle.userGameMeta?.punishmentLine, ["d8h4"]);

      const duelState = beginArrowDuelPuzzle(arrowPuzzle, "seed-1");
      assert.equal(duelState.correctMove, ARROW_DUEL_BEST_MOVE);
      assert.equal(duelState.wrongMove, ARROW_DUEL_BLUNDER_MOVE);
      const wrongChoice = submitArrowDuelChoice(duelState, ARROW_DUEL_BLUNDER_MOVE, {
        opponentReply: false
      });
      assert.equal(wrongChoice.feedback.result, "wrong");
      assert.deepEqual(wrongChoice.feedback.review?.punishmentLine, ["g2g4", "d8h4"]);

      const rightWithReply = submitArrowDuelChoice(duelState, ARROW_DUEL_BEST_MOVE, {
        opponentReply: true
      });
      assert.equal(rightWithReply.feedback.result, "correct");
      assert.equal(rightWithReply.state.phase, "reply_handoff");
      const replyResult = submitArrowDuelReply(
        { ...rightWithReply.state, phase: "reply" },
        "d8h4"
      );
      assert.equal(replyResult.feedback.result, "correct");
      assert.equal(replyResult.feedback.puzzleSolved, true);

      const continuedLine = continueArrowDuelReplyLine(arrowPuzzle, "d8h4");
      assert.equal(continuedLine.feedback.result, "correct");
      assert.equal(continuedLine.feedback.puzzleSolved, true);

      // Record an attempt & review enrollment on lineStored, then re-analyze replacing it with a different puzzle!
      const service = new PracticeService(store);
      service.recordGameReviewRetryOutcome({
        puzzleId: lineStored.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard",
        result: "wrong",
        now: "2026-10-02T12:00:00.000Z"
      });
      service.recordReviewAttempt(
        {
          puzzleId: lineStored.id,
          mode: "standard",
          ratingKey: "ug_my_game_puzzles:standard",
          result: "correct",
          submittedMove: "d8h4",
          expectedMove: "d8h4"
        },
        "2026-10-03T12:00:00.000Z"
      );

      // Archive arrowStored, then re-analyze keeping arrowStored + adding a new line puzzle (dropping old lineStored).
      store.archiveUserPuzzle(arrowStored.id, true);
      const replacementLine = makeExtractedLinePuzzle(g1.id, {
        idSeed: `${g1.id}:5:line:opponent_mistake_missed:pos2`,
        ply: 5,
        initialFen: LINE_PUZZLE_2_INITIAL_FEN,
        solutionMoves: [...LINE_PUZZLE_2_MOVES],
        themes: ["fork"]
      });
      const reanalyzed = store.replaceGameUserPuzzles(
        g1.id,
        [arrowExtracted, replacementLine],
        { nowIso: "2026-10-04T00:00:00.000Z" }
      );
      assert.equal(reanalyzed.length, 2);
      // Preserves createdAt and archived flag on unchanged ID:
      const keptArrow = reanalyzed.find((p) => p.id === arrowStored.id)!;
      assert.equal(keptArrow.createdAt, "2026-10-02T00:00:00.000Z");
      assert.equal(keptArrow.archived, true);
      assert.equal(store.getImportedGame(g1.id)?.puzzleCount, 2);
      // Old lineStored removed from user_puzzles, yet attempt history & getPuzzle still work without FK errors!
      assert.equal(store.getUserPuzzle(lineStored.id), undefined);
      assert.ok(store.getPuzzle(lineStored.id));
      assert.equal(store.countAttempts({ puzzleId: lineStored.id }), 1);

      // Reopen persistence check:
      if (ctx.reopen) {
        store = await ctx.reopen();
        assert.equal(store.listGamePlyEvaluations(g1.id).length, 3);
        assert.equal(store.countUserPuzzles({ gameId: g1.id, includeArchived: true }), 2);
        assert.equal(store.countUserPuzzles({ gameId: g1.id, includeArchived: false }), 1);
      }

      // Deleting the game cascades game_ply_evals & user_puzzles cleanly:
      store.deleteImportedGame(g1.id);
      assert.equal(store.getImportedGame(g1.id), undefined);
      assert.deepEqual(store.listGamePlyEvaluations(g1.id), []);
      assert.deepEqual(store.listUserPuzzles({ gameId: g1.id, includeArchived: true }), []);
      assert.equal(store.countAttempts({ puzzleId: lineStored.id }), 1);
    } finally {
      await ctx.cleanup();
    }
  });

  test(`${label}: deleteImportedGame cascades active user_puzzle attempts and review queue, and persists autoAddRecommendedToReview`, async () => {
    const ctx = await createStore();
    try {
      let store = ctx.store;
      assert.equal(store.getSettings().gameReview?.autoAddRecommendedToReview, false);
      store.saveSettings({
        ...store.getSettings(),
        gameReview: { autoAddRecommendedToReview: true }
      });
      if (ctx.reopen) {
        store = await ctx.reopen();
      }
      assert.equal(store.getSettings().gameReview?.autoAddRecommendedToReview, true);

      const g1 = makeImportedGame({ id: "chess_com:live:cascade1" });
      const g2 = makeImportedGame({ id: "chess_com:live:cascade2" });
      store.upsertImportedGames([g1, g2], "2026-10-02T00:00:00.000Z");
      const [p1] = store.replaceGameUserPuzzles(
        g1.id,
        [makeExtractedLinePuzzle(g1.id)],
        { nowIso: "2026-10-02T00:01:00.000Z" }
      );
      const [p2] = store.replaceGameUserPuzzles(
        g2.id,
        [
          makeExtractedLinePuzzle(g2.id, {
            idSeed: `${g2.id}:4:line:opponent_mistake_missed:pos2`,
            initialFen: LINE_PUZZLE_2_INITIAL_FEN,
            solutionMoves: [...LINE_PUZZLE_2_MOVES]
          })
        ],
        { nowIso: "2026-10-02T00:02:00.000Z" }
      );
      const service = new PracticeService(store);
      service.enrollReview({
        puzzleId: p1!.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard"
      });
      service.recordReviewAttempt(
        {
          puzzleId: p1!.id,
          mode: "standard",
          ratingKey: "ug_my_game_puzzles:standard",
          result: "wrong",
          submittedMove: "e2e3",
          expectedMove: "d8h4"
        },
        "2026-10-02T00:03:00.000Z"
      );
      service.recordReviewAttempt(
        {
          puzzleId: p2!.id,
          mode: "standard",
          ratingKey: "ug_my_game_puzzles:standard",
          result: "correct",
          submittedMove: "c6d4",
          expectedMove: "c6d4"
        },
        "2026-10-02T00:04:00.000Z"
      );

      store.deleteImportedGame(g1.id);
      assert.equal(store.getImportedGame(g1.id), undefined);
      assert.equal(store.countAttempts({ puzzleId: p1!.id }), 0);
      assert.deepEqual(
        store.listReviewQueue().map((item) => item.puzzleId),
        [p2!.id]
      );
      assert.equal(store.getPuzzle(p1!.id), undefined);
      // g2's puzzle & attempt remain intact
      assert.equal(store.getImportedGame(g2.id)?.id, g2.id);
      assert.equal(store.countAttempts({ puzzleId: p2!.id }), 1);
    } finally {
      await ctx.cleanup();
    }
  });

  test(`${label}: two-tier Review enrollment and unrated My Game Puzzles session`, async () => {
    const ctx = await createStore();
    try {
      const store = ctx.store;
      store.seedPuzzles([PACK_PUZZLE_1, PACK_PUZZLE_2]);

      const g1 = makeImportedGame({ id: "chess_com:live:900", timeClass: "blitz" });
      const g2 = makeImportedGame({ id: "lichess:rapid900", platform: "lichess", timeClass: "rapid" });
      store.upsertImportedGames([g1, g2], "2026-10-01T00:00:00.000Z");

      const [lineP1, arrowP1] = store.replaceGameUserPuzzles(
        g1.id,
        [makeExtractedLinePuzzle(g1.id), makeExtractedArrowDuelPuzzle(g1.id)],
        { ratingAnchor: 2450, nowIso: "2026-10-01T01:00:00.000Z" }
      );
      const [lineP2] = store.replaceGameUserPuzzles(
        g2.id,
        [
          makeExtractedLinePuzzle(g2.id, {
            idSeed: `${g2.id}:4:line:opponent_mistake_missed:pos2`,
            initialFen: LINE_PUZZLE_2_INITIAL_FEN,
            solutionMoves: [...LINE_PUZZLE_2_MOVES],
            themes: ["fork"]
          })
        ],
        { ratingAnchor: 480, nowIso: "2026-10-01T02:00:00.000Z" }
      );

      // Tier 1: extraction persists in user_puzzles without touching review_schedule.
      assert.equal(store.listReviewQueue().length, 0);

      // Default pack selection must NEVER mix user_game puzzles!
      const standardPackOnly = store.selectPuzzles({ mode: "standard", limit: 10 });
      assert.ok(standardPackOnly.every((p) => p.source !== "user_game"));
      assert.equal(store.countPuzzles(), 2);

      const service = new PracticeService(store);

      // Tier 2 (passed Retry): does NOT auto-enroll into Review Schedule.
      const passOutcome = service.recordGameReviewRetryOutcome({
        puzzleId: lineP1!.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard",
        result: "correct",
        now: "2026-10-01T12:00:00.000Z",
        timeZone: "America/Los_Angeles"
      });
      assert.deepEqual(passOutcome, { enrolled: false });
      assert.equal(store.listReviewQueue().length, 0);

      // Tier 2 (failed Retry): enrolls exact ReviewContext respecting timezone!
      const failOutcome = service.recordGameReviewRetryOutcome({
        puzzleId: lineP1!.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard",
        result: "wrong",
        now: "2026-10-01T23:30:00.000Z",
        timeZone: "America/Los_Angeles"
      });
      assert.equal(failOutcome.enrolled, true);
      assert.ok(failOutcome.review);
      assert.equal(failOutcome.review.puzzleId, lineP1!.id);
      assert.equal(failOutcome.review.dueDay, "2026-10-02");

      // Due review items return the real ug_* Puzzle with userGameMeta!
      const dueItems = service.getDueReviewItems("2026-10-02T12:00:00.000Z");
      assert.equal(dueItems.length, 1);
      assert.equal(dueItems[0]!.puzzle.id, lineP1!.id);
      assert.equal(dueItems[0]!.puzzle.source, "user_game");
      assert.equal(dueItems[0]!.puzzle.userGameMeta?.gameId, g1.id);

      // Respects Review Schedule Removal invariant (cannot enroll older than removal):
      service.removeReview(
        { puzzleId: lineP1!.id, mode: "standard", ratingKey: "ug_my_game_puzzles:standard" },
        "2026-10-02T15:00:00.000Z"
      );
      assert.throws(
        () =>
          service.recordGameReviewRetryOutcome({
            puzzleId: lineP1!.id,
            mode: "standard",
            ratingKey: "ug_my_game_puzzles:standard",
            result: "wrong",
            now: "2026-10-02T14:00:00.000Z"
          }),
        /removal/i
      );
      // Re-enrolling AFTER removal succeeds:
      const reEnrolled = service.recordGameReviewRetryOutcome({
        puzzleId: lineP1!.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard",
        result: "wrong",
        now: "2026-10-02T16:00:00.000Z"
      });
      assert.equal(reEnrolled.enrolled, true);

      // startMyGamePuzzlesSession (standard, filtered by timeClass, unrated by default):
      const stdRatingBefore = service.getRating("standard 5/20");
      const session = service.startMyGamePuzzlesSession(
        { mode: "standard", timeClass: "rapid", targetCorrect: 1 },
        "2026-10-03T10:00:00.000Z"
      );
      assert.equal(session.config.ratingPolicy, "unrated");
      assert.equal(session.puzzles.length, 1);
      assert.equal(session.puzzles[0]!.id, lineP2!.id);

      // Solve the rapid user puzzle (rating 480 — outside Lichess 600-2200 band!):
      let res = service.submitMove("h5e5", "2026-10-03T10:00:05.000Z");
      assert.equal(res.state.status, "active");
      res = service.submitMove("e5h8", "2026-10-03T10:00:10.000Z");
      assert.equal(res.state.status, "won");
      assert.equal(res.state.ratingAfter, undefined);
      assert.deepEqual(service.getRating("standard 5/20"), stdRatingBefore);
      assert.equal(service.listPlayedRatings().length, 0);

      // Marking the solved attempt unclear surfaces it in Session Replay with full userGameMeta:
      assert.ok(res.attempt);
      service.setAttemptUnclear(res.attempt.id, true, "2026-10-03T10:00:15.000Z");
      const replay = service.getSessionReplay(session.id);
      assert.equal(replay.length, 1);
      assert.equal(replay[0]!.puzzle.id, lineP2!.id);
      assert.equal(replay[0]!.puzzle.userGameMeta?.gameId, g2.id);

      // startMyGamePuzzlesSession in arrow_duel mode selects ONLY arrow_duel user puzzles:
      const arrowSession = service.startMyGamePuzzlesSession(
        {
          mode: "arrow_duel",
          opponentReply: { enabled: false, seconds: 20 },
          targetCorrect: 1
        },
        "2026-10-03T11:00:00.000Z"
      );
      assert.equal(arrowSession.puzzles.length, 1);
      assert.equal(arrowSession.puzzles[0]!.id, arrowP1!.id);
      const arrowMove = service.submitMove(ARROW_DUEL_BEST_MOVE, "2026-10-03T11:00:05.000Z");
      assert.equal(arrowMove.state.status, "won");
    } finally {
      await ctx.cleanup();
    }
  });

  test(`${label}: ProgressV2 safety guard keeps ug_* records local-only and ignores unknown remote ug_* records`, async () => {
    const ctx = await createStore();
    try {
      const store = ctx.store;
      store.seedPuzzles([PACK_PUZZLE_1]);
      const service = new PracticeService(store);
      const settings = service.getSettings();
      service.saveSettings({
        ...settings,
        sync: { iCloudEnabled: true }
      });

      // Import a game + extract a user puzzle + fail Retry + run My Game Puzzles + complete a review attempt.
      const g1 = makeImportedGame({ id: "chess_com:live:777" });
      store.upsertImportedGames([g1], "2026-10-01T00:00:00.000Z");
      const [ugPuzzle] = store.replaceGameUserPuzzles(g1.id, [makeExtractedLinePuzzle(g1.id)], {
        nowIso: "2026-10-01T01:00:00.000Z"
      });
      assert.ok(ugPuzzle);

      service.recordGameReviewRetryOutcome({
        puzzleId: ugPuzzle.id,
        mode: "standard",
        ratingKey: "ug_my_game_puzzles:standard",
        result: "wrong",
        now: "2026-10-01T12:00:00.000Z"
      });
      service.recordReviewAttempt(
        {
          puzzleId: ugPuzzle.id,
          mode: "standard",
          ratingKey: "ug_my_game_puzzles:standard",
          result: "correct",
          submittedMove: "d8h4",
          expectedMove: "d8h4"
        },
        "2026-10-02T12:00:00.000Z"
      );
      const ugSession = service.startMyGamePuzzlesSession(
        { mode: "standard", targetCorrect: 1 },
        "2026-10-02T13:00:00.000Z"
      );
      service.submitMove("d8h4", "2026-10-02T13:00:05.000Z");

      // Also complete a normal pack attempt so we confirm normal progress STILL syncs!
      service.enrollReview(
        { puzzleId: PACK_PUZZLE_1.id, mode: "standard", ratingKey: "standard 5/20" },
        "2026-10-02T14:00:00.000Z"
      );

      const transport = new FakeProgressV2Transport();
      const pushResult = await syncPracticeProgressV2(service, transport, {
        deviceId: "device-a",
        now: () => "2026-10-02T15:00:00.000Z"
      });
      assert.equal(pushResult.status, "synced");

      // Verify ZERO ug_* records were uploaded to CloudKit!
      for (const record of transport.records) {
        assert.ok(
          !record.recordName.includes(USER_GAME_PUZZLE_ID_PREFIX) &&
            !record.payload.includes(ugPuzzle.id) &&
            !record.payload.includes(ugSession.id),
          `Unexpected user-game data leaked into ProgressV2 record ${record.recordName}`
        );
      }
      // Normal pack review WAS uploaded:
      const packReviewRecordName = progressV2RecordName({
        kind: "review_schedule",
        entityKey: reviewEntityKey(PACK_PUZZLE_1.id, "standard", "standard 5/20")
      });
      assert.ok(transport.records.some((r) => r.recordName === packReviewRecordName));

      // Now simulate a remote device pushing unknown ug_* records + a ug_* tombstone into CloudKit:
      const unknownUgId = "ug_remote_unknown_0001";
      const remoteUgRecords: ProgressV2Record[] = [
        {
          recordName: progressV2RecordName({ kind: "attempt", entityKey: "remote-ug-attempt-1" }),
          kind: "attempt",
          schemaVersion: 2,
          payload: canonicalJson({
            formatVersion: 2,
            kind: "attempt",
            entityKey: "remote-ug-attempt-1",
            state: "present",
            value: {
              id: "remote-ug-attempt-1",
              source: "sprint",
              sessionId: "ug_remote_session_1",
              puzzleId: unknownUgId,
              mode: "standard",
              ratingKey: "ug_my_game_puzzles:standard",
              result: "correct",
              submittedMove: "d8h4",
              expectedMove: "d8h4",
              startedAt: "2026-10-03T00:00:00.000Z",
              completedAt: "2026-10-03T00:00:05.000Z",
              ratingBefore: 1200
            }
          })
        },
        {
          recordName: progressV2RecordName({
            kind: "review_schedule",
            entityKey: reviewEntityKey(unknownUgId, "standard", "ug_my_game_puzzles:standard")
          }),
          kind: "review_schedule",
          schemaVersion: 2,
          payload: canonicalJson({
            formatVersion: 2,
            kind: "review_schedule",
            entityKey: reviewEntityKey(unknownUgId, "standard", "ug_my_game_puzzles:standard"),
            state: "present",
            value: {
              kind: "scheduled",
              review: {
                puzzleId: unknownUgId,
                mode: "standard",
                ratingKey: "ug_my_game_puzzles:standard",
                dueDay: "2026-10-04",
                intervalDays: 1,
                reviewCount: 0,
                successStreak: 0,
                lapseCount: 0,
                lastResult: null,
                lastReviewedAt: null,
                enrolledAt: "2026-10-03T00:00:00.000Z",
                dueAt: "2026-10-04T04:00:00.000Z",
                intervalHours: 24
              }
            }
          })
        },
        {
          recordName: progressV2RecordName({
            kind: "review_schedule",
            entityKey: reviewEntityKey("ug_remote_deleted_0002", "standard", "standard 5/20")
          }),
          kind: "review_schedule",
          schemaVersion: 2,
          payload: canonicalJson({
            formatVersion: 2,
            kind: "review_schedule",
            entityKey: reviewEntityKey("ug_remote_deleted_0002", "standard", "standard 5/20"),
            state: "deleted",
            deletedAt: "2026-10-03T01:00:00.000Z"
          })
        }
      ];

      const secondDeviceTransport = new FakeProgressV2Transport({
        records: [...transport.records, ...remoteUgRecords]
      });
      const secondCtx = await createStore();
      try {
        secondCtx.store.seedPuzzles([PACK_PUZZLE_1]);
        const secondService = new PracticeService(secondCtx.store);
        secondService.saveSettings({
          ...secondService.getSettings(),
          sync: { iCloudEnabled: true }
        });
        const pullResult = await syncPracticeProgressV2(secondService, secondDeviceTransport, {
          deviceId: "device-b",
          now: () => "2026-10-03T02:00:00.000Z"
        });
        assert.equal(pullResult.status, "synced");
        // Pack review restored, unknown ug_* records safely skipped with zero errors!
        assert.ok(
          secondService.getReviewQueueState({
            puzzleId: PACK_PUZZLE_1.id,
            mode: "standard",
            ratingKey: "standard 5/20"
          })
        );
        assert.equal(
          secondService.getReviewQueueState({
            puzzleId: unknownUgId,
            mode: "standard",
            ratingKey: "ug_my_game_puzzles:standard"
          }),
          undefined
        );
      } finally {
        await secondCtx.cleanup();
      }
    } finally {
      await ctx.cleanup();
    }
  });
}

runStoreContractSuite("MemoryStore", async () => {
  const store = new MemoryStore();
  return {
    store,
    cleanup: async () => {}
  };
});

runStoreContractSuite("SQLiteStore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-game-review-sqlite-"));
  const dbPath = join(directory, "practice.sqlite");
  let activeStore = new SQLiteStore(dbPath);
  activeStore.migrate();
  return {
    store: activeStore,
    reopen: async () => {
      activeStore.close();
      activeStore = new SQLiteStore(dbPath);
      activeStore.migrate();
      return activeStore;
    },
    cleanup: async () => {
      activeStore.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
});

test("CompositePuzzleSource + PackBackedPracticeStore resolve pack and ug_* puzzles across Review, Replay, and Sprint selection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-composite-source-"));
  const dbPath = join(directory, "practice.sqlite");
  const { db: packDb, source: packSource } = createPackSourceDatabase([
    PACK_PUZZLE_1,
    PACK_PUZZLE_2
  ]);
  const userStore = new SQLiteStore(dbPath);
  try {
    userStore.migrate();
    const composite = new CompositePuzzleSource(packSource, userStore);
    const backedStore = new PackBackedPracticeStore(userStore, composite);

    const g1 = makeImportedGame({ id: "chess_com:live:500", timeClass: "blitz" });
    const g2 = makeImportedGame({ id: "lichess:rapid500", platform: "lichess", timeClass: "rapid" });
    backedStore.upsertImportedGames([g1, g2], "2026-10-01T00:00:00.000Z");

    const [ugLine1, ugArrow1] = backedStore.replaceGameUserPuzzles(
      g1.id,
      [makeExtractedLinePuzzle(g1.id), makeExtractedArrowDuelPuzzle(g1.id)],
      { nowIso: "2026-10-01T01:00:00.000Z" }
    );
    const [ugLine2] = backedStore.replaceGameUserPuzzles(
      g2.id,
      [
        makeExtractedLinePuzzle(g2.id, {
          idSeed: `${g2.id}:4:line:opponent_mistake_missed:pos2`,
          initialFen: LINE_PUZZLE_2_INITIAL_FEN,
          solutionMoves: [...LINE_PUZZLE_2_MOVES],
          themes: ["fork"]
        })
      ],
      { nowIso: "2026-10-01T02:00:00.000Z" }
    );

    // Direct lookup & batch lookup across both sources:
    assert.equal(composite.getPuzzle(PACK_PUZZLE_1.id)?.source, "lichess");
    assert.equal(composite.getPuzzle(ugLine1!.id)?.source, "user_game");
    assert.equal(composite.getPuzzle("ug_missing"), undefined);
    const batch = composite.getPuzzles([ugLine1!.id, PACK_PUZZLE_1.id, ugArrow1!.id, "missing"]);
    assert.deepEqual(
      batch.map((p) => p.id),
      [ugLine1!.id, PACK_PUZZLE_1.id, ugArrow1!.id]
    );

    // Default pack selection stays strictly pack-only:
    assert.deepEqual(
      composite.selectPuzzles({ mode: "standard", limit: 10 }).map((p) => p.id).sort(),
      [PACK_PUZZLE_1.id, PACK_PUZZLE_2.id]
    );
    assert.equal(composite.countPuzzles(), 2);

    // source: "user_game" filters cleanly by mode, timeClass, gameId, themes:
    assert.deepEqual(
      composite.selectPuzzles({ mode: "standard", source: "user_game", limit: 10 }).map((p) => p.id).sort(),
      [ugLine1!.id, ugLine2!.id].sort()
    );
    assert.deepEqual(
      composite
        .selectPuzzles({ mode: "standard", source: "user_game", timeClass: "rapid", limit: 10 })
        .map((p) => p.id),
      [ugLine2!.id]
    );
    assert.deepEqual(
      composite
        .selectPuzzles({ mode: "standard", source: "user_game", gameId: g1.id, limit: 10 })
        .map((p) => p.id),
      [ugLine1!.id]
    );
    assert.deepEqual(
      composite
        .selectPuzzles({ mode: "standard", source: "user_game", themes: ["fork"], limit: 10 })
        .map((p) => p.id),
      [ugLine2!.id]
    );
    assert.deepEqual(
      composite.selectPuzzles({ mode: "arrow_duel", source: "user_game", limit: 10 }).map((p) => p.id),
      [ugArrow1!.id]
    );

    // source: "all" combines both pack & user_game:
    const allStd = composite.selectPuzzles({ mode: "standard", source: "all", limit: 10 });
    assert.equal(allStd.length, 4);
    assert.ok(allStd.some((p) => p.source === "lichess"));
    assert.ok(allStd.some((p) => p.source === "user_game"));

    // End-to-end via PracticeService on PackBackedPracticeStore:
    const service = new PracticeService(backedStore);
    service.recordGameReviewRetryOutcome({
      puzzleId: ugLine1!.id,
      mode: "standard",
      ratingKey: "ug_my_game_puzzles:standard",
      result: "wrong",
      now: "2026-10-01T12:00:00.000Z"
    });
    const due = service.getDueReviewItems("2026-10-02T12:00:00.000Z");
    assert.equal(due.length, 1);
    assert.equal(due[0]!.puzzle.id, ugLine1!.id);
    assert.equal(due[0]!.puzzle.userGameMeta?.gameId, g1.id);

    const sprint = service.startMyGamePuzzlesSession(
      { mode: "standard", gameId: g1.id, targetCorrect: 1 },
      "2026-10-02T13:00:00.000Z"
    );
    assert.equal(sprint.puzzles[0]!.id, ugLine1!.id);
    service.submitMove("d8h4", "2026-10-02T13:00:05.000Z");
    assert.equal(service.getSessionReplay(sprint.id)[0]!.puzzle.id, ugLine1!.id);
  } finally {
    userStore.close();
    packDb.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Upgrading an existing pre-2.0 SQLite database to v27 preserves data and persists Game Review across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-pre20-upgrade-"));
  const dbPath = join(directory, "practice.sqlite");
  try {
    await copyFile(RELEASED_IOS_121_FIXTURE, dbPath);
    const upgraded = new SQLiteStore(dbPath);
    upgraded.migrate();

    const version = (
      upgraded.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    assert.equal(version, CURRENT_SCHEMA_VERSION);
    assert.equal(
      (upgraded.db.prepare("PRAGMA integrity_check").get() as { integrity_check: string })
        .integrity_check,
      "ok"
    );
    assert.deepEqual(upgraded.db.prepare("PRAGMA foreign_key_check").all(), []);

    // Existing historical data survived, and new Game Review tables are writable:
    const priorAttemptCount = upgraded.countAttempts();
    assert.ok(priorAttemptCount > 0);

    upgraded.upsertLinkedAccount({
      platform: "lichess",
      username: "pre20_user",
      createdAt: "2026-10-10T00:00:00.000Z"
    });
    const g1 = makeImportedGame({ id: "lichess:upgrade1", platform: "lichess" });
    upgraded.upsertImportedGames([g1], "2026-10-10T00:00:00.000Z");
    upgraded.saveGamePlyEvaluations(g1.id, makeSamplePlyEvals(g1.id), {
      analysisStatus: "complete",
      analysisCheckpointPly: 3
    });
    const [ugPuzzle] = upgraded.replaceGameUserPuzzles(
      g1.id,
      [makeExtractedLinePuzzle(g1.id)],
      { nowIso: "2026-10-10T00:05:00.000Z" }
    );
    upgraded.close();

    // Reopen and confirm everything persisted cleanly with zero FK issues:
    const reopened = new SQLiteStore(dbPath);
    reopened.migrate();
    try {
      assert.equal(reopened.countAttempts(), priorAttemptCount);
      assert.equal(reopened.listLinkedAccounts().length, 1);
      assert.equal(reopened.getImportedGame(g1.id)?.puzzleCount, 1);
      assert.equal(reopened.listGamePlyEvaluations(g1.id).length, 3);
      assert.equal(reopened.getUserPuzzle(ugPuzzle!.id)?.gameId, g1.id);
      assert.deepEqual(reopened.db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
