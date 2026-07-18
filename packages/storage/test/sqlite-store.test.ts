import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildPracticeProgressSummary, PracticeService, SQLiteStore } from "../src/index.ts";
import type { AttemptHistoryRow, HistoryFilter } from "../src/index.ts";
import { historyAttemptReplayAvailability, normalizeHistoryAttemptDetail } from "../../core/src/index.ts";
import type { Puzzle, ReviewContext } from "../../core/src/index.ts";

process.env.TZ = "UTC";

test("SQLite store seeds fixture puzzles and filters Arrow Duel eligibility", async () => {
  const store = await seededStore();
  try {
    assert.equal(store.countPuzzles(), 4);
    assert.equal(store.getPuzzle("00008")?.stockfishBestMove, "b2b1");

    const arrowPuzzles = store.selectPuzzles({ mode: "arrow_duel", limit: 10 });
    assert.deepEqual(arrowPuzzles.map((puzzle) => puzzle.id).sort(), ["00008", "0018S", "001h8"]);

    const themePuzzles = store.selectPuzzles({ mode: "standard", limit: 10, theme: "hangingPiece" });
    assert.deepEqual(themePuzzles.map((puzzle) => puzzle.id), ["00008"]);
  } finally {
    store.close();
  }
});

test("SQLite store does not select duplicate puzzle positions for one sprint", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const puzzles = await loadFixturePuzzles();
  try {
    store.seedPuzzles([
      puzzles[0] as Puzzle,
      {
        ...(puzzles[0] as Puzzle),
        id: "00008-copy",
        initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 37 91"
      },
      puzzles[1] as Puzzle
    ]);

    const selected = store.selectPuzzles({ mode: "standard", limit: 3 });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf", "00008"]);
  } finally {
    store.close();
  }
});

test("SQLite store can scope future puzzle selection without deleting seeded puzzles", async () => {
  const store = await seededStore();
  try {
    const selected = store.selectPuzzles({
      mode: "standard",
      limit: 10,
      includeIds: ["000hf"],
      rating: 1500
    });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf"]);
    assert.equal(store.getPuzzle("00008")?.id, "00008");
  } finally {
    store.close();
  }
});

test("SQLite persists Arrow Duel attempt candidate order across reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-arrow-order-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const store = new SQLiteStore(dbPath);
    store.migrate();
    store.seedPuzzles(await loadFixturePuzzles());
    const service = new PracticeService(store);
    const sprint = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: 1,
        maxMistakes: 3,
        minRating: 1700,
        maxRating: 1800
      },
      "2026-06-20T00:00:00.000Z"
    );
    const currentPuzzle = sprint.currentPuzzle;
    assert.equal(currentPuzzle?.kind, "arrow_duel");
    const candidateOrder = currentPuzzle?.kind === "arrow_duel" ? currentPuzzle.candidates : [];

    const result = service.submitMove("f2g3", "2026-06-20T00:00:05.000Z");
    assert.deepEqual(result.attempt?.arrowDuelCandidateOrder, candidateOrder);
    store.close();

    const reopened = new SQLiteStore(dbPath);
    reopened.migrate();
    try {
      assert.deepEqual(reopened.listAttempts({ result: "wrong" })[0]?.arrowDuelCandidateOrder, candidateOrder);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SQLite migration adds Arrow Duel candidate order to existing attempts tables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-arrow-order-migration-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'sprint',
        session_id TEXT NOT NULL,
        puzzle_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        rating_key TEXT,
        result TEXT NOT NULL,
        submitted_move TEXT NOT NULL,
        expected_move TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        rating_before INTEGER NOT NULL,
        rating_after INTEGER
      );
    `);
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    store.migrate();
    store.close();

    const migratedDb = new DatabaseSync(dbPath);
    const columns = migratedDb.prepare("PRAGMA table_info(attempts)").all() as Array<{ name: string }>;
    migratedDb.close();
    assert.ok(columns.some((column) => column.name === "arrow_duel_candidate_order_json"));
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SQLite migration adds server-compatible Glicko fields to existing ratings tables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-rating-migration-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE ratings (
        key TEXT NOT NULL,
        generation INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        games INTEGER NOT NULL,
        PRIMARY KEY (key, generation)
      );
      INSERT INTO ratings (key, generation, rating, games)
      VALUES ('standard 5/20', 0, 900, 4);
    `);
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    store.migrate();
    const rating = store.getRating("standard 5/20");
    store.close();

    const migratedDb = new DatabaseSync(dbPath);
    const columns = migratedDb.prepare("PRAGMA table_info(ratings)").all() as Array<{ name: string }>;
    migratedDb.close();
    assert.ok(columns.some((column) => column.name === "rating_deviation"));
    assert.ok(columns.some((column) => column.name === "volatility"));
    assert.deepEqual(rating, {
      key: "standard 5/20",
      generation: 0,
      rating: 900,
      ratingDeviation: 350,
      volatility: 0.06,
      games: 4
    });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SQLite migration preserves legacy settings while adding the sync upload safety flag", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-settings-migration-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        sync_icloud_enabled INTEGER NOT NULL,
        review_reminder_mode TEXT NOT NULL,
        review_reminder_fixed_local_time TEXT
      );
      INSERT INTO app_settings (
        id,
        sync_icloud_enabled,
        review_reminder_mode,
        review_reminder_fixed_local_time
      ) VALUES ('default', 0, 'fixed', '19:00');
    `);
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    store.migrate();
    assert.deepEqual(store.getSettings(), {
      sync: { iCloudEnabled: false },
      notifications: { reviewReminder: { mode: "fixed", fixedLocalTime: "19:00" } }
    });

    store.saveSettings({
      sync: { iCloudEnabled: true },
      notifications: { reviewReminder: { mode: "off" } }
    });
    store.migrate();
    store.close();

    const migratedDb = new DatabaseSync(dbPath);
    const columns = migratedDb.prepare("PRAGMA table_info(app_settings)").all() as Array<{ name: string }>;
    const settings = migratedDb.prepare("SELECT * FROM app_settings WHERE id = 'default'").get() as {
      id: string;
      sync_icloud_enabled: number;
      sync_upload_allowed: number;
      review_reminder_mode: string;
      review_reminder_fixed_local_time: string | null;
    };
    const integrity = migratedDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    migratedDb.close();

    assert.ok(columns.some((column) => column.name === "sync_upload_allowed"));
    assert.deepEqual({ ...settings }, {
      id: "default",
      sync_icloud_enabled: 1,
      sync_upload_allowed: 0,
      review_reminder_mode: "off",
      review_reminder_fixed_local_time: null
    });
    assert.equal(integrity.integrity_check, "ok");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SQLite migration backfills attempt rating keys and replaces superseded indexes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-index-migration-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const setupStore = new SQLiteStore(dbPath);
    setupStore.migrate();
    setupStore.seedPuzzles(await loadFixturePuzzles());
    const service = new PracticeService(setupStore);
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    setupStore.close();

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      DROP INDEX attempts_unclear_completed_at_idx;
      ALTER TABLE attempts DROP COLUMN unclear_updated_at;
      ALTER TABLE attempts DROP COLUMN unclear;
      PRAGMA user_version = 1;
      UPDATE attempts SET rating_key = NULL;
      DROP INDEX puzzles_rating_id_idx;
      DROP INDEX attempts_completed_at_id_idx;
      DROP INDEX attempts_rating_key_completed_at_id_idx;
      DROP INDEX attempts_session_result_completed_at_id_idx;
      DROP INDEX attempts_puzzle_id_completed_at_id_idx;
      DROP INDEX sprint_sessions_rating_key_completed_at_id_idx;
      DROP INDEX sprint_sessions_started_at_id_idx;
      DROP INDEX custom_sprint_configs_last_started_at_id_idx;
      DROP INDEX review_queue_due_day_order_idx;
      DROP TABLE review_events;
      DROP TABLE review_queue;
      CREATE TABLE review_queue (
        puzzle_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'standard',
        rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
        due_at TEXT NOT NULL,
        interval_hours INTEGER NOT NULL,
        review_count INTEGER NOT NULL,
        success_streak INTEGER NOT NULL,
        lapse_count INTEGER NOT NULL,
        last_result TEXT NOT NULL,
        last_reviewed_at TEXT NOT NULL,
        PRIMARY KEY (puzzle_id, mode, rating_key),
        FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
      );
      CREATE TABLE review_events (
        id TEXT PRIMARY KEY,
        puzzle_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'standard',
        rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
        result TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        next_due_at TEXT NOT NULL,
        interval_hours INTEGER NOT NULL,
        FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
      );
      CREATE INDEX attempts_completed_at_idx ON attempts(completed_at);
      CREATE INDEX attempts_result_idx ON attempts(result);
      CREATE INDEX attempts_mode_idx ON attempts(mode);
      CREATE INDEX attempts_session_id_idx ON attempts(session_id);
      CREATE INDEX sprint_sessions_rating_key_completed_at_idx ON sprint_sessions(rating_key, completed_at);
      CREATE INDEX custom_sprint_configs_last_started_at_idx ON custom_sprint_configs(last_started_at);
      CREATE INDEX review_queue_due_at_idx ON review_queue(due_at);
      CREATE INDEX review_events_reviewed_at_idx ON review_events(reviewed_at);
    `);
    legacyDb.close();

    const migrated = new SQLiteStore(dbPath);
    migrated.migrate();
    migrated.migrate();
    try {
      assert.equal(migrated.listAttempts()[0]?.ratingKey, "standard 5/20");
      assert.equal(migrated.getHistoryView({
        now: "2026-06-21T00:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20"
      }).attempts.length, 1);
      const indexes = (migrated.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name")
        .all() as Array<{ name: string }>).map((row) => row.name);
      assert.ok(indexes.includes("attempts_completed_at_id_idx"));
      assert.ok(indexes.includes("attempts_rating_key_completed_at_id_idx"));
      assert.ok(indexes.includes("attempts_session_result_completed_at_id_idx"));
      assert.ok(indexes.includes("puzzles_rating_id_idx"));
      assert.ok(indexes.includes("review_queue_due_day_order_idx"));
      assert.ok(indexes.includes("sprint_sessions_started_at_id_idx"));
      assert.ok(!indexes.includes("attempts_completed_at_idx"));
      assert.ok(!indexes.includes("attempts_result_idx"));
      assert.ok(!indexes.includes("attempts_mode_idx"));
      assert.ok(!indexes.includes("attempts_session_id_idx"));
      assert.ok(indexes.includes("review_events_reviewed_at_idx"));
    } finally {
      migrated.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("optimized SQLite attempt filters preserve legacy query results", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e6",
      expectedMove: "e2e6",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "a1a2",
      expectedMove: "b2b1",
      startedAt: "2026-06-22T00:00:00.000Z",
      arrowDuelCandidateOrder: ["b2b1", "b2a2", "b2c2"]
    }, "2026-06-22T00:00:05.000Z");

    const filters: HistoryFilter[] = [
      {},
      { source: "scheduled_review" },
      { result: "wrong" },
      { mode: "arrow_duel" },
      { since: "2026-06-21T00:00:05.000Z" },
      { puzzleId: "000hf" },
      { sessionId: sprint.id },
      { sessionId: sprint.id, result: "wrong" },
      { source: "scheduled_review", result: "wrong", mode: "arrow_duel", puzzleId: "00008" }
    ];

    for (const filter of filters) {
      assert.deepEqual(store.listAttempts(filter), legacyListAttempts(store, filter));
    }

    const historyNow = "2026-06-23T00:00:00.000Z";
    assert.deepEqual(
      service.getHistoryView({ now: historyNow, timeRange: "max", ratingKey: "standard 5/20" }).attempts.map((attempt) => attempt.id),
      legacyHistoryAttemptIds(store, "standard 5/20", undefined, historyNow)
    );
    assert.deepEqual(
      service.getHistoryView({ now: historyNow, timeRange: "max" }).attempts.map((attempt) => attempt.id),
      legacyHistoryAttemptIds(store, undefined, undefined, historyNow)
    );

    const sessionPlan = store.db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM attempts
         WHERE session_id = ? AND result = ?
         ORDER BY completed_at DESC, id DESC`
      )
      .all(sprint.id, "wrong") as Array<{ detail: string }>;
    assert.ok(sessionPlan.some((row) => row.detail.includes("attempts_session_result_completed_at_id_idx")));
    assert.ok(sessionPlan.every((row) => !row.detail.includes("SCAN attempts") && !row.detail.includes("TEMP B-TREE")));
  } finally {
    store.close();
  }
});

test("optimized SQLite indexes cover production range and ordering queries", async () => {
  const store = await seededStore();
  try {
    const plans = [
      {
        sql: "SELECT * FROM puzzles WHERE rating >= ? AND rating <= ? ORDER BY rating ASC, id ASC",
        params: [1200, 1800],
        index: "puzzles_rating_id_idx"
      },
      {
        sql: "SELECT id, started_at FROM sprint_sessions ORDER BY started_at DESC, id DESC",
        params: [],
        index: "sprint_sessions_started_at_id_idx"
      },
      {
        sql: "SELECT * FROM review_queue WHERE due_day <= ? ORDER BY due_day ASC, puzzle_id ASC, mode ASC, rating_key ASC",
        params: ["2026-06-22"],
        index: "review_queue_due_day_order_idx"
      },
      {
        sql: "SELECT id FROM sprint_sessions WHERE rating_key = ? AND completed_at >= ? AND completed_at <= ? ORDER BY completed_at ASC, id ASC",
        params: ["standard 5/20", "2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
        index: "sprint_sessions_rating_key_completed_at_id_idx"
      },
      {
        sql: `SELECT a.id
              FROM attempts a
              JOIN sprint_sessions s ON s.id = a.session_id
              JOIN puzzles p ON p.id = a.puzzle_id
              WHERE a.rating_key = ? AND a.completed_at >= ? AND a.completed_at <= ?
              ORDER BY a.completed_at DESC, a.id DESC`,
        params: ["standard 5/20", "2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
        index: "attempts_rating_key_completed_at_id_idx"
      }
    ];

    for (const expected of plans) {
      const plan = store.db.prepare(`EXPLAIN QUERY PLAN ${expected.sql}`).all(...expected.params) as Array<{ detail: string }>;
      assert.ok(plan.some((row) => row.detail.includes(expected.index)), `${expected.index}: ${JSON.stringify(plan)}`);
      assert.ok(plan.every((row) => !row.detail.includes("TEMP B-TREE")), JSON.stringify(plan));
    }
  } finally {
    store.close();
  }
});

test("PracticeService selects SQLite sprint puzzles from the current run ELO window", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 1800, games: 3 });

    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");
  } finally {
    store.close();
  }
});

test("PracticeService exposes current-session mistake review items from SQLite history", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    const result = service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    assert.equal(result.state.status, "failed");
    assert.equal(store.listAttempts({ sessionId: sprint.id, result: "wrong" }).length, 1);
    const review = service.getSessionMistakeReview(sprint.id);
    assert.equal(review.length, 1);
    assert.equal(review[0]?.puzzle.id, "000hf");
    assert.equal(review[0]?.attempt.submittedMove, "c4b5");
  } finally {
    store.close();
  }
});

test("PracticeService builds SQLite history view for a required time range and rating key", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.deepEqual(service.listPlayedRatings(), []);

    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T12:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T12:00:05.000Z");

    const view = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "7d",
      ratingKey: "standard 5/20",
      result: "wrong",
      theme: "mate"
    });

    assert.deepEqual(
      view.ratingKeys.map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.equal(view.attempts.length, 1);
    assert.equal(view.attempts[0]?.ratingKey, "standard 5/20");
    assert.equal(view.attempts[0]?.puzzleId, "000hf");
    assert.equal(view.attempts[0]?.puzzleRating, 1485);
    assert.equal(service.getHistoryView({ ...view.query, maxRating: 1485 }).attempts.length, 1);
    assert.equal(service.getHistoryView({ ...view.query, minRating: 1486 }).attempts.length, 0);
    assert.ok(view.availableThemes.includes("mate"));
    assert.equal(view.elo.length, 1);
    assert.deepEqual(view.puzzleStats, [
      {
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        correctCount: 0,
        wrongCount: 1,
        lastWrongAt: "2026-06-20T12:00:05.000Z",
        nextReviewDay: "2026-06-21"
      }
    ]);

    const oppositeSide = view.attempts[0]?.side === "white" ? "black" : "white";
    assert.equal(service.getHistoryView({ ...view.query, side: oppositeSide }).attempts.length, 0);
    assert.equal(service.getDueReviewItems("2026-06-21T12:00:05.000Z")[0]?.puzzle.id, "000hf");
    assert.deepEqual(
      service.getHistoryView({ ...view.query, reviewStatus: "queued" }).attempts.map((attempt) => attempt.id),
      view.attempts.map((attempt) => attempt.id)
    );
    assert.deepEqual(service.getHistoryView({ ...view.query, reviewStatus: "clear" }).attempts, []);

    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");
    assert.equal(store.listAttempts({ source: "scheduled_review", result: "correct" }).length, 1);

    service.resetRating("standard 5/20");
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService builds SQLite history view across rating buckets when no rating key is selected", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "c4b5",
      expectedMove: "e2e6",
      startedAt: "2026-06-20T00:00:00.000Z"
    }, "2026-06-20T00:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "correct",
      submittedMove: "b2b1",
      expectedMove: "b2b1",
      startedAt: "2026-06-20T00:01:00.000Z"
    }, "2026-06-20T00:01:05.000Z");

    const view = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max"
    });

    assert.deepEqual(
      view.attempts.map((attempt) => attempt.ratingKey).sort(),
      ["arrow duel 5/30", "standard 5/20"]
    );
    assert.deepEqual(view.performance.charts.rating, []);
  } finally {
    store.close();
  }
});

test("PracticeService marks corrupt persisted history fields partial without fabricating replay metadata", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    const recorded = service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "h6g7",
      expectedMove: "b2b1",
      startedAt: "2026-06-20T00:00:00.000Z",
      arrowDuelCandidateOrder: ["b2b1", "h6g7"]
    }, "2026-06-20T00:00:05.000Z");
    store.db
      .prepare(`UPDATE attempts
        SET source = ?, mode = ?, rating_key = ?, result = ?, started_at = ?, completed_at = ?,
            rating_after = ?, arrow_duel_candidate_order_json = ?
        WHERE id = ?`)
      .run(
        "mystery-source",
        "mystery-mode",
        " ",
        "mystery-result",
        "0",
        "01/02/03",
        "not-a-rating",
        "{malformed-json",
        recorded.attempt.id
      );

    const view = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
    });

    assert.equal(view.attempts.length, 1);
    assert.deepEqual(view.attempts[0]?.arrowDuelCandidateOrderStatus, "corrupt");
    assert.deepEqual(normalizeHistoryAttemptDetail(view.attempts[0]!), {
      id: recorded.attempt.id,
      puzzleId: "00008",
      source: null,
      mode: null,
      ratingKey: null,
      result: null,
      startedAt: null,
      completedAt: null,
      elapsedSeconds: null,
      submittedMove: "h6g7",
      expectedMove: "b2b1",
      ratingBefore: 600,
      ratingAfter: null,
      ratingAfterStatus: "invalid",
      ratingDelta: null,
      arrowDuelCandidateOrderStatus: "corrupt",
      dataStatus: "partial"
    });
  } finally {
    store.close();
  }
});

test("PracticeService keeps semantically invalid persisted Arrow candidates readable but unavailable for replay", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    const recorded = service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "h6g7",
      expectedMove: "b2b1",
      startedAt: "2026-06-20T00:00:00.000Z",
      arrowDuelCandidateOrder: ["b2b1", "h6g7"]
    }, "2026-06-20T00:00:05.000Z");
    store.db
      .prepare("UPDATE attempts SET arrow_duel_candidate_order_json = ? WHERE id = ?")
      .run(JSON.stringify(["b2b1", "a1a2"]), recorded.attempt.id);

    const view = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max"
    });
    const persistedAttempt = view.attempts[0]!;
    const puzzle = service.getPuzzle(persistedAttempt.puzzleId)!;

    assert.deepEqual(persistedAttempt.arrowDuelCandidateOrder, ["b2b1", "a1a2"]);
    assert.deepEqual(normalizeHistoryAttemptDetail(persistedAttempt).submittedMove, "h6g7");
    assert.deepEqual(historyAttemptReplayAvailability({ attempt: persistedAttempt, puzzle }), {
      status: "unavailable",
      reason: "arrow-candidates-unavailable"
    });
  } finally {
    store.close();
  }
});

test("PracticeService persists SQLite custom sprint configs after successful custom starts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      {
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        persistCustomConfig: true
      },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    service.startSprint(
      {
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        persistCustomConfig: true
      },
      "2026-06-21T00:00:00.000Z"
    );

    assert.deepEqual(service.getActiveSprint()?.puzzles.map((puzzle) => puzzle.id), ["00008"]);
    assert.deepEqual(service.listCustomSprintConfigs(), [
      {
        id: "custom-custom-300-20-hangingPiece",
        mode: "custom",
        ratingKey: "hangingPiece custom 5/20",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        lastStartedAt: "2026-06-21T00:00:00.000Z",
        playCount: 2
      }
    ]);
  } finally {
    store.close();
  }
});

test("PracticeService persists SQLite settings across store reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-mobile-settings-"));
  const databasePath = join(directory, "settings.sqlite");
  try {
    {
      const store = new SQLiteStore(databasePath);
      store.migrate();
      const service = new PracticeService(store);
      try {
        assert.deepEqual(service.getSettings(), {
          sync: {
            iCloudEnabled: true
          },
          notifications: {
            reviewReminder: {
              mode: "smart"
            }
          }
        });

        service.saveSettings({
          sync: {
            iCloudEnabled: true
          },
          notifications: {
            reviewReminder: {
              mode: "fixed",
              fixedLocalTime: "20:30"
            }
          }
        });

        assert.deepEqual(service.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "08:15" }), {
          mode: "fixed",
          fixedLocalTime: "08:15"
        });
        assert.deepEqual(service.getReviewReminderSettings(), { kind: "fixed", hour: 8, minute: 15 });
      } finally {
        store.close();
      }
    }

    {
      const store = new SQLiteStore(databasePath);
      store.migrate();
      const service = new PracticeService(store);
      try {
        assert.deepEqual(service.getSettings(), {
          sync: {
            iCloudEnabled: true
          },
          notifications: {
            reviewReminder: {
              mode: "fixed",
              fixedLocalTime: "08:15"
            }
          }
        });
        assert.deepEqual(service.getReviewReminderPreference(), { mode: "fixed", fixedLocalTime: "08:15" });
        assert.deepEqual(service.getReviewReminderSettings(), { kind: "fixed", hour: 8, minute: 15 });
        assert.deepEqual(service.saveReviewReminderPreference({ mode: "off" }), { mode: "off" });
        assert.deepEqual(service.getSettings().notifications.reviewReminder, { mode: "off" });
        assert.deepEqual(service.exportLocalData().settings, service.getSettings());
      } finally {
        store.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PracticeService clears SQLite local history without resetting ratings or puzzles", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");

    assert.equal(store.countPuzzles(), 4);
    assert.equal((service.listHistory() as unknown[]).length, 2);
    assert.equal(service.getDueReviewItems("2026-06-25T00:00:00.000Z").length, 1);
    const exported = service.exportLocalData();
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.attempts.length, 2);
    assert.equal(exported.reviewQueue.length, 1);
    assert.equal(exported.sprintSessions.length, 2);
    assert.deepEqual(exported.ratings.map((rating) => rating.key), ["standard 5/20"]);
    const ratingBefore = service.getRating("standard 5/20");

    const result = service.clearLocalHistory();

    assert.deepEqual(result, {
      attempts: 2,
      reviewEvents: 1,
      reviewQueue: 1,
      sprintSessions: 2
    });
    assert.equal(store.countPuzzles(), 4);
    assert.deepEqual(service.listHistory(), []);
    assert.deepEqual(service.getDueReviewItems("2026-06-21T00:00:05.000Z"), []);
    assert.deepEqual(service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20"
    }).attempts, []);
    assert.deepEqual(service.getRating("standard 5/20"), ratingBefore);
  } finally {
    store.close();
  }
});

test("PracticeService records official SQLite reviews in history without mixing queue contexts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");

    const all = service.getHistoryView({
      now: "2026-06-22T00:00:00.000Z",
      timeRange: "7d",
      ratingKey: "standard 5/20"
    });
    assert.deepEqual(all.attempts.map((attempt) => attempt.source), ["scheduled_review", "sprint"]);
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "scheduled_review" }).attempts.map((attempt) => attempt.result),
      ["correct"]
    );
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "scheduled_review" }).attempts.map((attempt) => ({
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt
      })),
      [{ startedAt: "2026-06-21T00:00:00.000Z", completedAt: "2026-06-21T00:00:05.000Z" }]
    );
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "sprint" }).attempts.map((attempt) => attempt.result),
      ["wrong"]
    );

    store.recordReviewResult({ puzzleId: "000hf", mode: "arrow_duel", ratingKey: "arrow duel 5/30" }, "wrong", "2026-06-21T00:01:00.000Z");
    assert.deepEqual(
      store.getDueReviews("2026-06-25T00:00:00.000Z").map((review) => `${review.puzzleId}:${review.mode}:${review.ratingKey}`).sort(),
      ["000hf:arrow_duel:arrow duel 5/30", "000hf:standard:standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService pages SQLite history over all available sprint attempts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-05-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-05-20T00:00:05.000Z");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const firstPage = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      page: { limit: 1 }
    });
    assert.deepEqual(firstPage.page, {
      limit: 1,
      offset: 0,
      total: 2,
      hasMore: true
    });
    assert.equal(firstPage.attempts[0]?.completedAt, "2026-06-20T00:00:05.000Z");

    const secondPage = service.getHistoryView({
      ...firstPage.query,
      page: { limit: 1, offset: 1 }
    });
    assert.deepEqual(secondPage.page, {
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false
    });
    assert.equal(secondPage.attempts[0]?.completedAt, "2026-05-20T00:00:05.000Z");
  } finally {
    store.close();
  }
});

test("PracticeService exposes the current rating for the selected sprint run", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.equal(service.getRating("standard 5/20").rating, 600);

    const reset = service.resetRating("standard 5/20") as { generation: number; rating: number };

    assert.equal(reset.rating, 600);
    assert.equal(service.getRating("standard 5/20").generation, 1);
    const adjusted = service.setRating("standard 5/20", 725);
    assert.equal(adjusted.rating, 725);
    assert.equal(adjusted.generation, 2);
    assert.equal(adjusted.games, 0);
    assert.equal(adjusted.ratingDeviation, 100);
    assert.equal(service.getRating("standard 5/20").rating, 725);
    assert.throws(() => service.setRating("standard 5/20", 599), /at least 600/);
    assert.throws(() => service.setRating("standard 5/20", 700.5), /integer/);
  } finally {
    store.close();
  }
});

test("PracticeService repairs an inflated SQLite rating from completed sprint history", async () => {
  const store = await seededStore();
  let service = new PracticeService(store);
  try {
    service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece"
      },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    const ratingKey = "hangingPiece standard 5/20";
    const completedRating = service.getRating(ratingKey);
    store.saveRating({
      ...completedRating,
      rating: completedRating.rating + 600
    });

    service = new PracticeService(store);

    assert.equal(service.getRating(ratingKey).rating, completedRating.rating);
    assert.equal(service.getRating(ratingKey).games, completedRating.games);
  } finally {
    store.close();
  }
});

test("PracticeService preserves a manually anchored SQLite rating across restart", async () => {
  const store = await seededStore();
  let service = new PracticeService(store);
  try {
    service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece"
      },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    const ratingKey = "hangingPiece standard 5/20";
    const volatility = service.getRating(ratingKey).volatility;

    const adjusted = service.setRating(ratingKey, 900);

    assert.equal(adjusted.games, 0);
    assert.equal(adjusted.ratingDeviation, 100);
    assert.equal(adjusted.volatility, volatility);
    service = new PracticeService(store);
    assert.equal(service.getRating(ratingKey).rating, 900);
    assert.equal(service.getRating(ratingKey).games, 0);
  } finally {
    store.close();
  }
});

test("SQLite review result updates expand and contract the persisted review schedule", async () => {
  const store = await seededStore();
  try {
    const context = reviewContext("00008");
    store.scheduleMistakeReview(context, "2026-06-20T12:00:00.000Z");

    const success = store.recordReviewResult(context, "correct", "2026-06-21T12:00:00.000Z");
    assert.equal(success.dueDay, "2026-06-22");
    assert.equal(success.intervalDays, 1);
    assert.equal(success.successStreak, 1);

    const secondSuccess = store.recordReviewResult(context, "correct", "2026-06-22T12:00:00.000Z");
    assert.equal(secondSuccess.dueDay, "2026-06-25");
    assert.equal(secondSuccess.intervalDays, 3);
    assert.equal(secondSuccess.successStreak, 2);

    const wrong = store.recordReviewResult(context, "wrong", "2026-06-23T12:00:00.000Z");
    assert.equal(wrong.dueDay, "2026-06-24");
    assert.equal(wrong.successStreak, 0);
    assert.equal(wrong.lapseCount, 1);
  } finally {
    store.close();
  }
});

test("SQLite sprint misses do not count as failed scheduled review lapses", async () => {
  const store = await seededStore();
  try {
    const context = reviewContext("000hf");

    const firstMiss = store.scheduleMistakeReview(context, "2026-06-20T00:00:00.000Z");
    const repeatedMiss = store.scheduleMistakeReview(context, "2026-06-20T12:00:00.000Z");
    const failedReview = store.recordReviewResult(context, "wrong", "2026-06-21T12:00:00.000Z");

    assert.equal(firstMiss.reviewCount, 0);
    assert.equal(firstMiss.lapseCount, 0);
    assert.equal(repeatedMiss.reviewCount, 0);
    assert.equal(repeatedMiss.lapseCount, 0);
    assert.equal(repeatedMiss.dueDay, "2026-06-21");
    assert.equal(failedReview.reviewCount, 1);
    assert.equal(failedReview.lapseCount, 1);
  } finally {
    store.close();
  }
});

test("PracticeService prunes orphaned SQLite review queue rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-sqlite-orphan-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const setupStore = new SQLiteStore(dbPath);
    setupStore.migrate();
    setupStore.seedPuzzles(await loadFixturePuzzles());
    setupStore.scheduleMistakeReview(reviewContext("000hf"), "2026-06-20T00:00:00.000Z");
    setupStore.close();

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec("PRAGMA foreign_keys = OFF");
    legacyDb
      .prepare(
        `INSERT INTO review_queue (
          puzzle_id,
          mode,
          rating_key,
          due_day,
          interval_days,
          review_count,
          success_streak,
          lapse_count,
          last_result,
          last_reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "missing-puzzle",
        "standard",
        "standard 5/20",
        "2026-06-21",
        1,
        0,
        0,
        0,
        "wrong",
        "2026-06-20T00:00:00.000Z"
      );
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    const service = new PracticeService(store);
    try {
      assert.equal(service.listReviewQueue().length, 2);
      assert.equal(service.getDueReviewItems("2026-06-22T00:00:00.000Z").length, 1);
      assert.equal(service.pruneOrphanedReviewQueue(), 1);
      assert.deepEqual(service.listReviewQueue().map((review) => review.puzzleId), ["000hf"]);
      assert.equal(service.pruneOrphanedReviewQueue(), 0);
    } finally {
      store.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("PracticeService can promote the next future SQLite review date to due now", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    store.scheduleMistakeReview(reviewContext("00008"), "2026-06-20T08:00:00.000Z");
    store.scheduleMistakeReview(reviewContext("000hf"), "2026-06-20T18:00:00.000Z");
    store.scheduleMistakeReview(reviewContext("0018S"), "2026-06-21T12:00:00.000Z");

    const result = service.promoteNextFutureReviewsToDue("2026-06-20T20:00:00.000Z");

    assert.deepEqual(result, {
      promotedCount: 2,
      promotedDate: "2026-06-21",
      dueDay: "2026-06-20"
    });
    assert.deepEqual(
      service.getDueReviews("2026-06-20T20:00:00.000Z").map((review) => review.puzzleId).sort(),
      ["00008", "000hf"]
    );
    assert.equal(store.getReviewQueueState(reviewContext("0018S"))?.dueDay, "2026-06-22");
  } finally {
    store.close();
  }
});

test("PracticeService future review promotion is a SQLite no-op without future rows", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.deepEqual(service.promoteNextFutureReviewsToDue("2026-06-20T20:00:00.000Z"), { promotedCount: 0 });
  } finally {
    store.close();
  }
});
test("SQLite review result without an existing queue row is counted once", async () => {
  const store = await seededStore();
  try {
    const wrong = store.recordReviewResult(reviewContext("00008"), "wrong", "2026-06-20T12:00:00.000Z");
    assert.equal(wrong.reviewCount, 1);
    assert.equal(wrong.lapseCount, 1);
    assert.equal(wrong.dueDay, "2026-06-21");

    const correct = store.recordReviewResult(reviewContext("000hf"), "correct", "2026-06-20T12:00:00.000Z");
    assert.equal(correct.reviewCount, 1);
    assert.equal(correct.successStreak, 1);
    assert.equal(correct.dueDay, "2026-06-21");
  } finally {
    store.close();
  }
});

test("SQLite transaction rolls back partial writes", async () => {
  const store = await seededStore();
  try {
    assert.throws(() => {
      store.transaction(() => {
        store.resetRating("standard 5/20");
        throw new Error("boom");
      });
    }, /boom/);

    assert.equal(store.getRating("standard 5/20").generation, 0);
  } finally {
    store.close();
  }
});

test("PracticeService persists wrong attempts, history filters, review queue, and rating reset generations", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T12:00:00.000Z"
    );
    const result = service.submitMove("c4b5", "2026-06-20T12:00:05.000Z");
    assert.equal(result.attempt?.result, "wrong");

    const wrongHistory = store.listAttempts({
      result: "wrong",
      since: "2026-06-19T00:00:00.000Z"
    });
    assert.equal(wrongHistory.length, 1);
    assert.equal(wrongHistory[0]?.puzzleId, "000hf");

    const futureDue = store.getDueReviews("2026-06-22T00:00:00.000Z");
    assert.equal(futureDue.length, 1);
    assert.equal(futureDue[0]?.puzzleId, "000hf");
    const fullQueue = service.listReviewQueue();
    assert.equal(fullQueue.length, 1);
    assert.equal(fullQueue[0]?.puzzleId, "000hf");
    assert.equal(service.getDueReviews("2026-06-20T12:00:00.000Z").length, 0);

    const rating = store.getRating("standard 5/20");
    const reset = store.resetRating("standard 5/20");
    assert.equal(reset.generation, rating.generation + 1);
    assert.equal(store.listAttempts({ result: "wrong" }).length, 1);
  } finally {
    store.close();
  }
});

test("PracticeService rejects starting a second sprint while one is active", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.throws(
      () =>
        service.startSprint(
          { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
          "2026-06-20T00:00:01.000Z"
        ),
      /another sprint is active/
    );
  } finally {
    store.close();
  }
});

test("PracticeService records a completed sprint and persists updated ELO", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    let sprint = service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece"
      },
      "2026-06-20T00:00:00.000Z"
    );
    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");

    let result = service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    assert.equal(result.state.status, "won");

    const rating = store.getRating("hangingPiece standard 5/20");
    assert.equal(rating.rating, 775);
    assert.ok((rating.ratingDeviation ?? 0) < 350);
    assert.equal(rating.volatility, 0.06);
    assert.equal(rating.games, 1);
  } finally {
    store.close();
  }
});

test("PracticeService restores a completed Standard attempt, rating, progress, and history after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-standard-relaunch-"));
  const databasePath = join(directory, "chessticize-mobile.sqlite");
  const completedAt = "2026-07-14T12:00:15.000Z";
  try {
    const firstStore = new SQLiteStore(databasePath);
    firstStore.migrate();
    firstStore.seedPuzzles(await loadFixturePuzzles());
    const firstService = new PracticeService(firstStore);
    try {
      firstService.startSprint(
        {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 1,
          maxMistakes: 3,
          theme: "hangingPiece"
        },
        "2026-07-14T12:00:00.000Z"
      );
      firstService.submitMove("e6e7", "2026-07-14T12:00:05.000Z");
      firstService.submitMove("b3c1", "2026-07-14T12:00:10.000Z");
      const completion = firstService.submitMove("h6c1", completedAt);
      assert.equal(completion.state.status, "won");
    } finally {
      firstStore.close();
    }

    const reopenedStore = new SQLiteStore(databasePath);
    reopenedStore.migrate();
    const reopenedService = new PracticeService(reopenedStore);
    try {
      assert.deepEqual(reopenedService.getRating("hangingPiece standard 5/20"), {
        key: "hangingPiece standard 5/20",
        generation: 0,
        rating: 775,
        ratingDeviation: 248.17054151409985,
        volatility: 0.06,
        games: 1
      });
      assert.equal(reopenedService.listHistory().length, 1);
      assert.deepEqual(
        reopenedService.getHistoryView({
          now: "2026-07-14T13:00:00.000Z",
          timeRange: "max",
          ratingKey: "hangingPiece standard 5/20"
        }).attempts.map((attempt) => ({
          completedAt: attempt.completedAt,
          ratingAfter: attempt.ratingAfter,
          result: attempt.result,
          submittedMove: attempt.submittedMove
        })),
        [{ completedAt, ratingAfter: 775, result: "correct", submittedMove: "h6c1" }]
      );
      assert.deepEqual(
        reopenedService.listSprintSessions().map((session) => ({
          ratingAfter: session.ratingAfter,
          status: session.status
        })),
        [{ ratingAfter: 775, status: "won" }]
      );
      assert.deepEqual(
        buildPracticeProgressSummary(
          reopenedService.listHistory(),
          reopenedService.listSprintSessions(),
          new Date("2026-07-14T13:00:00.000Z").getTime(),
          "hangingPiece standard 5/20"
        ),
        {
          correctThisWeek: 1,
          accuracyThisWeek: 100,
          ratingDeltaThisWeek: 175,
          wrongThisWeek: 0,
          netThisWeek: 1
        }
      );
    } finally {
      reopenedStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PracticeService restores completed scheduled Review history and its future queue after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-review-relaunch-"));
  const databasePath = join(directory, "chessticize-mobile.sqlite");
  const reviewCompletedAt = "2026-06-21T12:00:05.000Z";
  try {
    const firstStore = new SQLiteStore(databasePath);
    firstStore.migrate();
    firstStore.seedPuzzles(await loadFixturePuzzles());
    const firstService = new PracticeService(firstStore);
    try {
      firstStore.scheduleMistakeReview(reviewContext("000hf"), "2026-06-20T12:00:00.000Z");
      firstService.recordReviewAttempt({
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: "correct",
        submittedMove: "e6f7",
        expectedMove: "e6f7",
        startedAt: "2026-06-21T12:00:00.000Z"
      }, reviewCompletedAt);
    } finally {
      firstStore.close();
    }

    const reopenedStore = new SQLiteStore(databasePath);
    reopenedStore.migrate();
    const reopenedService = new PracticeService(reopenedStore);
    try {
      assert.deepEqual(
        reopenedService.listHistory({ source: "scheduled_review" }).map((attempt) => ({
          completedAt: attempt.completedAt,
          puzzleId: attempt.puzzleId,
          result: attempt.result,
          source: attempt.source
        })),
        [{
          completedAt: reviewCompletedAt,
          puzzleId: "000hf",
          result: "correct",
          source: "scheduled_review"
        }]
      );
      assert.deepEqual(
        reopenedService.listCompletedReviewsForDay(reviewCompletedAt).map((item) => ({
          puzzleId: item.puzzle.id,
          result: item.attempt.result
        })),
        [{ puzzleId: "000hf", result: "correct" }]
      );
      assert.deepEqual(reopenedService.getDueReviewItems(reviewCompletedAt), []);
      assert.equal(reopenedService.getDueReviewItems("2026-06-22T12:00:00.000Z")[0]?.puzzle.id, "000hf");
      assert.deepEqual(
        reopenedService.listReviewQueue().map((review) => ({
          dueDay: review.dueDay,
          intervalDays: review.intervalDays,
          lastResult: review.lastResult,
          puzzleId: review.puzzleId,
          reviewCount: review.reviewCount
        })),
        [{
          dueDay: "2026-06-22",
          intervalDays: 1,
          lastResult: "correct",
          puzzleId: "000hf",
          reviewCount: 1
        }]
      );
    } finally {
      reopenedStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PracticeService restores SQLite reviews for the current 4 AM review day", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  const beforeRollover = new Date(2026, 5, 21, 3, 59, 0, 0).toISOString();
  const afterRollover = new Date(2026, 5, 21, 4, 1, 0, 0).toISOString();
  const currentReviewDay = new Date(2026, 5, 21, 12, 0, 0, 0).toISOString();
  try {
    service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "f2g3",
      expectedMove: "b2b1"
    }, beforeRollover);
    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e6f7",
      expectedMove: "e6f7"
    }, afterRollover);

    assert.deepEqual(
      service.listCompletedReviewsForDay(currentReviewDay).map((item) => ({
        puzzleId: item.puzzle.id,
        result: item.attempt.result
      })),
      [{ puzzleId: "000hf", result: "correct" }]
    );
  } finally {
    store.close();
  }
});

async function seededStore(): Promise<SQLiteStore> {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  store.seedPuzzles(await loadFixturePuzzles());
  return store;
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}

function reviewContext(puzzleId: string): ReviewContext {
  return {
    puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20"
  };
}

interface LegacyAttemptRow extends Omit<AttemptHistoryRow, "ratingAfter" | "arrowDuelCandidateOrder"> {
  ratingAfter: number | null;
  arrowDuelCandidateOrderJson: string | null;
}

function legacyListAttempts(store: SQLiteStore, filter: HistoryFilter): AttemptHistoryRow[] {
  const rows = store.db
    .prepare(
      `SELECT
        id,
        source,
        session_id AS sessionId,
        puzzle_id AS puzzleId,
        mode,
        rating_key AS ratingKey,
        result,
        submitted_move AS submittedMove,
        expected_move AS expectedMove,
        started_at AS startedAt,
        completed_at AS completedAt,
        rating_before AS ratingBefore,
        rating_after AS ratingAfter,
        arrow_duel_candidate_order_json AS arrowDuelCandidateOrderJson
       FROM attempts
       WHERE (? IS NULL OR source = ?)
         AND (? IS NULL OR result = ?)
         AND (? IS NULL OR mode = ?)
         AND (? IS NULL OR completed_at >= ?)
         AND (? IS NULL OR puzzle_id = ?)
         AND (? IS NULL OR session_id = ?)
       ORDER BY completed_at DESC, id DESC`
    )
    .all(
      filter.source ?? null,
      filter.source ?? null,
      filter.result ?? null,
      filter.result ?? null,
      filter.mode ?? null,
      filter.mode ?? null,
      filter.since ?? null,
      filter.since ?? null,
      filter.puzzleId ?? null,
      filter.puzzleId ?? null,
      filter.sessionId ?? null,
      filter.sessionId ?? null
    ) as LegacyAttemptRow[];

  return rows.map((row) => {
    const { ratingAfter, arrowDuelCandidateOrderJson, ...attempt } = row;
    return {
      ...attempt,
      ...(ratingAfter === null ? {} : { ratingAfter }),
      ...(arrowDuelCandidateOrderJson === null
        ? {}
        : { arrowDuelCandidateOrder: JSON.parse(arrowDuelCandidateOrderJson) as string[] })
    };
  });
}

function legacyHistoryAttemptIds(
  store: SQLiteStore,
  ratingKey: string | undefined,
  since: string | undefined,
  until: string
): string[] {
  return (store.db
    .prepare(
      `SELECT a.id
       FROM attempts a
       JOIN sprint_sessions s ON s.id = a.session_id
       JOIN puzzles p ON p.id = a.puzzle_id
       WHERE (? IS NULL OR COALESCE(a.rating_key, s.rating_key) = ?)
         AND (? IS NULL OR a.completed_at >= ?)
         AND a.completed_at <= ?
       ORDER BY a.completed_at DESC, a.id DESC`
    )
    .all(ratingKey ?? null, ratingKey ?? null, since ?? null, since ?? null, until) as Array<{ id: string }>).map((row) => row.id);
}
