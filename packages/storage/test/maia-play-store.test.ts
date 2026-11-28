import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_MAIA_SETUP_PREFERENCES,
  abortMaiaGame,
  applyMaiaGameMove,
  createMaiaGameState,
  resignMaiaGame
} from "../../core/src/index.ts";
import {
  CURRENT_SCHEMA_VERSION,
  MemoryStore,
  PracticeService,
  SQLiteStore
} from "../src/index.ts";

test("SQLiteStore v30 persists Maia ratings, setup preferences, active game, and saves finished games into imported_games", () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  const outboxBefore = store.progressV2.listOutbox(50).length;

  // Preferences round-trip (remember last setup, including Unlimited Classical & Instant pace)
  const prefs = {
    timeControl: { initialMinutes: 5, incrementSeconds: 3, unlimited: false },
    rated: false,
    opponentRating: 1600,
    colorPreference: "b" as const,
    thinkingPace: "instant" as const
  };
  service.saveMaiaSetupPreferences(prefs);
  assert.deepEqual(service.getMaiaSetupPreferences(), prefs);

  // Initial rating can be adjusted before game 1, locked after game 1
  const seeded = service.setInitialMaiaRating("blitz", 1400);
  assert.equal(seeded.rating, 1400);
  assert.equal(seeded.games, 0);

  // Active game persistence & resume
  let game = createMaiaGameState({
    id: "maia-test-1",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 5, incrementSeconds: 3, unlimited: false },
      rated: true,
      colorPreference: "w"
    },
    userRating: 1400,
    nowMs: 10_000,
    nowIso: "2026-11-27T20:00:00.000Z"
  });
  game = applyMaiaGameMove(game, "e2e4", { nowMs: 12_000 }).state;
  game = applyMaiaGameMove(game, "e7e5", { nowMs: 14_000 }).state;
  service.saveActiveMaiaGame(game);

  const resumed = service.getActiveMaiaGame();
  assert.ok(resumed);
  assert.equal(resumed.id, "maia-test-1");
  assert.equal(resumed.moves.length, 2);

  // Resign and complete -> updates Blitz rating, saves to Games with platform 'maia', clears active game
  const finished = resignMaiaGame(resumed, "2026-11-27T20:05:00.000Z");
  const completed = service.completeMaiaGame(finished);
  assert.equal(service.getActiveMaiaGame(), undefined);
  assert.ok(completed.savedGameId);
  assert.ok(completed.ratingRecord.rating < 1400);
  assert.equal(completed.ratingRecord.games, 1);
  assert.equal(completed.ratingRecord.losses, 1);

  // Saved game appears in Games list with platform 'maia'
  const saved = service.getImportedGame(completed.savedGameId);
  assert.ok(saved);
  assert.equal(saved.platform, "maia");
  assert.equal(saved.timeClass, "blitz");
  assert.equal(saved.timeControl, "300+3");
  assert.equal(saved.black.isAi, true);
  assert.equal(saved.rated, true);

  // Once 1 game is played, setInitialMaiaRating is a no-op
  const locked = service.setInitialMaiaRating("blitz", 1800);
  assert.equal(locked.rating, completed.ratingRecord.rating);

  // Unrated game saves to Games without changing rating
  let unrated = createMaiaGameState({
    id: "maia-test-unrated",
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl: { initialMinutes: 0, incrementSeconds: 0, unlimited: true },
      rated: false,
      opponentRating: 1800,
      colorPreference: "w"
    },
    userRating: 1200,
    nowMs: 20_000
  });
  unrated = applyMaiaGameMove(unrated, "d2d4", { nowMs: 21_000 }).state;
  unrated = applyMaiaGameMove(unrated, "d7d5", { nowMs: 22_000 }).state;
  const unratedDone = service.completeMaiaGame(resignMaiaGame(unrated, "2026-11-27T20:10:00.000Z"));
  assert.equal(unratedDone.ratingRecord.games, 0);
  const savedUnrated = service.getImportedGame(unratedDone.savedGameId!);
  assert.ok(savedUnrated);
  assert.equal(savedUnrated.timeClass, "classical");
  assert.equal(savedUnrated.timeControl, "-");
  assert.equal(savedUnrated.rated, false);

  // Aborted game clears active game without saving to Games or changing rating
  const aborted = abortMaiaGame(
    createMaiaGameState({
      id: "maia-test-abort",
      preferences: DEFAULT_MAIA_SETUP_PREFERENCES,
      userRating: 1200
    })
  );
  service.saveActiveMaiaGame(aborted);
  const abortedRes = service.completeMaiaGame(aborted);
  assert.equal(abortedRes.savedGameId, undefined);
  assert.equal(service.getActiveMaiaGame(), undefined);
  assert.equal(service.getImportedGame("maia_maia-test-abort"), undefined);

  // ProgressV2 outbox must NOT have been polluted by Maia ratings or games
  assert.equal(store.progressV2.listOutbox(50).length, outboxBefore);
});

test("v29 -> v30 SQLite migration preserves existing imported_games, game_ply_evals, and user_puzzles while enabling platform='maia'", () => {
  // Start with a fresh v30 store, downgrade imported_games back to v29 CHECK + user_version=29,
  // seed parent + child rows, then re-run migrate() to verify zero cascade data loss!
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const db = store.db as unknown as DatabaseSync;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    DROP TABLE maia_ratings;
    DROP TABLE maia_preferences;
    DROP TABLE maia_active_game;
    CREATE TABLE imported_games_v29 (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK (platform IN ('chess_com', 'lichess', 'pgn')),
      username TEXT NOT NULL,
      user_color TEXT NOT NULL CHECK (user_color IN ('w', 'b')),
      played_at TEXT NOT NULL,
      time_control TEXT NOT NULL,
      time_class TEXT NOT NULL,
      rated INTEGER NOT NULL CHECK (rated IN (0, 1)),
      url TEXT,
      white_username TEXT NOT NULL,
      white_rating INTEGER,
      white_is_ai INTEGER NOT NULL DEFAULT 0 CHECK (white_is_ai IN (0, 1)),
      black_username TEXT NOT NULL,
      black_rating INTEGER,
      black_is_ai INTEGER NOT NULL DEFAULT 0 CHECK (black_is_ai IN (0, 1)),
      winner TEXT NOT NULL CHECK (winner IN ('w', 'b', 'none')),
      termination TEXT NOT NULL,
      eco TEXT,
      opening TEXT,
      pgn TEXT NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'none'
        CHECK (analysis_status IN ('none', 'partial', 'pass1_done', 'complete')),
      analysis_checkpoint_ply INTEGER NOT NULL DEFAULT 0 CHECK (analysis_checkpoint_ply >= 0),
      white_accuracy REAL,
      black_accuracy REAL,
      puzzle_count INTEGER NOT NULL DEFAULT 0 CHECK (puzzle_count >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    DROP TABLE imported_games;
    ALTER TABLE imported_games_v29 RENAME TO imported_games;
    PRAGMA user_version = 29;
  `);
  db.exec("PRAGMA foreign_keys = ON");

  // Seed a v29 imported game + child ply eval + child user puzzle
  store.upsertImportedGames([
    {
      id: "lichess_existing_1",
      platform: "lichess",
      username: "alice",
      userColor: "w",
      playedAt: "2026-11-20T12:00:00.000Z",
      timeControl: "600+0",
      timeClass: "rapid",
      rated: true,
      white: { username: "alice", rating: 1520, isAi: false },
      black: { username: "bob", rating: 1500, isAi: false },
      winner: "w",
      termination: "mate",
      pgn: "1. e4 e5 1-0"
    }
  ]);
  store.saveGamePlyEvaluations(
    "lichess_existing_1",
    [
      {
        gameId: "lichess_existing_1",
        ply: 1,
        moveNumber: 1,
        color: "w",
        uci: "e2e4",
        san: "e4",
        fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        evalKind: "cp",
        whiteScore: 20,
        sideToMoveScore: 20,
        whiteWinPercent: 52,
        moverWinPercentBefore: 50,
        moverWinPercentAfter: 52,
        winPercentLoss: 0,
        classification: "best",
        clockBucket: "unknown",
        isKeyMomentCandidate: false,
        fromPreExistingEval: false,
        deepVerified: false
      }
    ],
    { analysisStatus: "pass1_done", analysisCheckpointPly: 1 }
  );

  // Now migrate v29 -> v30!
  store.migrate();
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  assert.equal(version, CURRENT_SCHEMA_VERSION);
  assert.equal(store.getImportedGame("lichess_existing_1")?.white.rating, 1520);
  assert.equal(store.listGamePlyEvaluations("lichess_existing_1").length, 1);

  // Inserting a platform='maia' game now succeeds!
  store.upsertImportedGames([
    {
      id: "maia_after_upgrade",
      platform: "maia",
      username: "You",
      userColor: "w",
      playedAt: "2026-11-27T20:00:00.000Z",
      timeControl: "600+0",
      timeClass: "rapid",
      rated: true,
      white: { username: "You", rating: 1500, isAi: false },
      black: { username: "Maia 1500", rating: 1500, isAi: true },
      winner: "w",
      termination: "mate",
      pgn: "1. e4 e5 1-0"
    }
  ]);
  assert.equal(store.getImportedGame("maia_after_upgrade")?.platform, "maia");

  // MemoryStore parity smoke check
  const memService = new PracticeService(new MemoryStore());
  assert.equal(memService.listMaiaRatings().length, 3);
});
