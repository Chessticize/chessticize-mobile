import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  beginArrowDuelPuzzle,
  serializeCurrentPuzzleView,
  type Puzzle
} from "../../core/src/index.ts";
import {
  MemoryStore,
  NodeSqliteDatabase,
  PracticeService,
  SQLitePuzzlePackSource,
  SQLiteStore
} from "../src/index.ts";

test("SQLitePuzzlePackSource uses arrow_duel_rating for Arrow Duel selection and Survival while keeping rating for Standard", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-ad-rating-pack-"));
  const packPath = join(dir, "pack.sqlite");
  try {
    const db = new DatabaseSync(packPath);
    db.exec(`
      CREATE TABLE themes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        initial_fen TEXT NOT NULL,
        solution_moves TEXT NOT NULL,
        rating INTEGER NOT NULL,
        arrow_duel_rating INTEGER,
        rating_deviation INTEGER NOT NULL,
        stockfish_eval REAL NOT NULL,
        stockfish_bestmove TEXT NOT NULL,
        stockfish_eval_after_first_move REAL NOT NULL
      );
      CREATE TABLE puzzle_themes (
        puzzle_id TEXT NOT NULL,
        theme_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        arrow_duel_rating INTEGER,
        PRIMARY KEY (puzzle_id, theme_id)
      ) WITHOUT ROWID;

      INSERT INTO themes (id, name) VALUES (24, 'fork');
    `);

    // Puzzle A: High Lichess Standard (2050), but TRIVIAL Arrow Duel (650)
    // Puzzle B: Moderate Lichess Standard (1400), High Arrow Duel trap (1950)
    db.prepare(`
      INSERT INTO puzzles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "p_easy_ad",
      "4k3/8/8/8/8/8/4R3/4K3 w - -",
      "e2e1 e8d7",
      2050,
      650,
      75,
      0,
      "e2e7",
      -500
    );
    db.prepare(`
      INSERT INTO puzzles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "p_hard_ad",
      "4k3/8/8/8/8/8/3R4/4K3 w - -",
      "d2d1 e8e7",
      1400,
      1950,
      75,
      0,
      "d2d7",
      -500
    );
    db.prepare("INSERT INTO puzzle_themes VALUES (?, ?, ?, ?)").run("p_easy_ad", 24, 2050, 650);
    db.prepare("INSERT INTO puzzle_themes VALUES (?, ?, ?, ?)").run("p_hard_ad", 24, 1400, 1950);
    db.close();

    const rawRo = new DatabaseSync(packPath, { readOnly: true });
    const roDb = new NodeSqliteDatabase(rawRo);
    const source = new SQLitePuzzlePackSource(roDb, { arrowDuelEligibility: "all_non_promotion" });

    // Standard at 1900-2100 picks p_easy_ad (rating=2050)
    const stdHigh = source.selectPuzzles({ mode: "standard", minRating: 1900, maxRating: 2100, limit: 10 });
    assert.deepEqual(stdHigh.map((p) => p.id), ["p_easy_ad"]);
    assert.equal(stdHigh[0]?.rating, 2050);
    assert.equal(stdHigh[0]?.arrowDuelRating, 650);

    // Arrow Duel at 1900-2100 picks p_hard_ad (arrow_duel_rating=1950), NOT p_easy_ad!
    const adHigh = source.selectPuzzles({ mode: "arrow_duel", minRating: 1900, maxRating: 2100, limit: 10 });
    assert.deepEqual(adHigh.map((p) => p.id), ["p_hard_ad"]);

    // Themed Arrow Duel at 600-800 picks p_easy_ad via puzzle_themes.arrow_duel_rating!
    const adLowThemed = source.selectPuzzles({
      mode: "arrow_duel",
      themes: ["fork"],
      minRating: 600,
      maxRating: 800,
      limit: 10
    });
    assert.deepEqual(adLowThemed.map((p) => p.id), ["p_easy_ad"]);

    // Survival Arrow Duel at 1800-2100 picks p_hard_ad!
    const survivalCount = source.countSurvivalPuzzles({
      challengeType: "arrow_duel",
      level: { minRating: 1800, maxRating: 2100 }
    });
    assert.equal(survivalCount, 1);
    const survivalBatch = source.selectSurvivalPuzzleBatch({
      challengeType: "arrow_duel",
      level: { minRating: 1800, maxRating: 2100 },
      selectionSeed: "seed-1",
      limit: 5
    });
    assert.deepEqual(survivalBatch.puzzles.map((p) => p.id), ["p_hard_ad"]);

    rawRo.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Arrow Duel active puzzle view, local SQLite cache, History, and InMemory store use arrowDuelRating", async () => {
  const puzzle: Puzzle = {
    id: "ad_rating_e2e_1",
    initialFen: "4k3/8/8/8/8/8/4R3/6K1 w - - 0 1",
    solutionMoves: ["e2a2", "e8d7", "a2a7"],
    rating: 2050,
    arrowDuelRating: 780,
    ratingDeviation: 75,
    themes: ["fork"],
    source: "lichess",
    stockfishEval: 500,
    stockfishBestMove: "e2e7",
    stockfishEvalAfterFirstMove: -500
  };

  // 1. Live serialized current puzzle view exposes arrowDuelRating for Arrow Duel
  const currentAd = beginArrowDuelPuzzle(puzzle);
  const view = serializeCurrentPuzzleView(currentAd) as { rating: number };
  assert.equal(view.rating, 780);

  // 2. SQLiteStore persists puzzles.arrow_duel_rating and uses it for Arrow Duel History & Survival
  const sqliteStore = new SQLiteStore(":memory:");
  sqliteStore.migrate();
  sqliteStore.seedPuzzles([puzzle]);
  assert.equal(sqliteStore.getPuzzle(puzzle.id)?.arrowDuelRating, 780);
  assert.equal(
    sqliteStore.countSurvivalPuzzles({
      challengeType: "arrow_duel",
      level: { minRating: 700, maxRating: 900 }
    }),
    1
  );
  assert.equal(
    sqliteStore.countSurvivalPuzzles({
      challengeType: "arrow_duel",
      level: { minRating: 1900, maxRating: 2200 }
    }),
    0
  );

  const sqliteService = new PracticeService(sqliteStore);
  sqliteService.startSprint(
    {
      mode: "arrow_duel",
      minRating: 700,
      maxRating: 900,
      opponentReply: { enabled: false, seconds: 10 }
    },
    "2026-11-27T12:00:00.000Z"
  );
  sqliteService.submitMove("e2e7", "2026-11-27T12:00:03.000Z");
  const sqliteAdHistory = sqliteStore.getHistoryView({
    mode: "arrow_duel",
    timeRange: "max",
    now: "2026-11-27T12:05:00.000Z"
  });
  assert.equal(sqliteAdHistory.attempts[0]?.puzzleRating, 780);

  sqliteService.startSprint(
    {
      mode: "standard",
      minRating: 1900,
      maxRating: 2200
    },
    "2026-11-27T12:01:00.000Z"
  );
  sqliteService.submitMove("e8d7", "2026-11-27T12:01:02.000Z");
  const sqliteStdHistory = sqliteStore.getHistoryView({
    mode: "standard",
    timeRange: "max",
    now: "2026-11-27T12:05:00.000Z"
  });
  assert.equal(sqliteStdHistory.attempts[0]?.puzzleRating, 2050);
  sqliteStore.close();

  // 3. MemoryStore matches SQLite History behavior
  const memStore = new MemoryStore();
  memStore.seedPuzzles([puzzle]);
  const memService = new PracticeService(memStore);
  memService.startSprint(
    {
      mode: "arrow_duel",
      minRating: 700,
      maxRating: 900,
      opponentReply: { enabled: false, seconds: 10 }
    },
    "2026-11-27T12:00:00.000Z"
  );
  memService.submitMove("e2e7", "2026-11-27T12:00:03.000Z");
  const memHistory = memStore.getHistoryView({
    mode: "arrow_duel",
    timeRange: "max",
    now: "2026-11-27T12:05:00.000Z"
  });
  assert.equal(memHistory.attempts[0]?.puzzleRating, 780);
});
