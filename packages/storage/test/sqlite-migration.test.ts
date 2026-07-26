import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

process.env.TZ = "UTC";
import {
  CURRENT_SCHEMA_VERSION,
  NodeSqliteDatabase,
  PracticeService,
  SQLiteStore
} from "../src/index.ts";
import { SyncSQLiteStore, type SyncSqliteDatabase } from "../src/sync-sqlite-store.ts";
import { computeSchemaSnapshot, type SchemaSnapshot } from "./schema-snapshot.ts";
import type { Puzzle } from "../../core/src/index.ts";

const RELEASED_V0_FIXTURE = resolve(
  "packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
);
const RELEASED_V0_SHA256 = "f9746607dcd98c642a1b111be348dd7476ee12a239c10346b64abe069e6cad5f";
const RELEASED_IOS_121_FIXTURE = resolve(
  "packages/storage/test/fixtures/migrations/schema-v8-ios-1.2.1.sqlite"
);
const RELEASED_IOS_121_SHA256 = "09ab34a656b6315189a4bc8e75baa64f1226492dce1cf5bb192d444822ee442b";
const GOLDEN_SCHEMA_SNAPSHOTS_DIR = resolve("packages/storage/test/fixtures/schema-snapshots");
const PUZZLE_FIXTURE = resolve("fixtures/puzzles/presolved-sample.json");
const SNAPSHOT_TABLES = [
  "app_settings",
  "puzzles",
  "ratings",
  "sprint_sessions",
  "attempts",
  "custom_sprint_configs",
  "practice_runs",
  "review_queue",
  "review_schedule_removals",
  "review_events",
  "tactical_profile_source_state"
] as const;

test("SQLite migrates an empty database to the current schema version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-empty-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const store = new SQLiteStore(databasePath);
    store.migrate();
    store.close();

    const db = new DatabaseSync(databasePath);
    try {
      assert.equal(schemaVersion(db), CURRENT_SCHEMA_VERSION);
      assert.deepEqual(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(rowName),
        [...SNAPSHOT_TABLES].sort()
      );
      assert.equal(integrityResult(db), "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite v8 promotes legacy Custom Sprint configs even after an interim v7 install", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-v8-run-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const setup = new SQLiteStore(databasePath);
    setup.migrate();
    setup.saveCustomSprintConfig({
      id: "legacy-regular",
      mode: "custom",
      ratingKey: "pin custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["pin"],
      lastStartedAt: "2026-07-21T12:00:00.000Z",
      playCount: 2
    });
    setup.saveCustomSprintConfig({
      id: "legacy-arrow",
      mode: "arrow_duel",
      ratingKey: "sacrifice arrow_duel 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["sacrifice"],
      lastStartedAt: "2026-07-09T12:00:00.000Z",
      playCount: 1
    });
    setup.db.exec("PRAGMA user_version = 7");
    setup.close();

    const migrated = new SQLiteStore(databasePath);
    migrated.migrate();
    try {
      assert.equal(schemaVersionForStore(migrated), CURRENT_SCHEMA_VERSION);
      assert.deepEqual(
        new PracticeService(migrated).listPracticeRuns().map((run) => run.name),
        ["Standard", "Arrow Duel", "Regular Puzzle 1", "Arrow Duel 1"]
      );
      assert.deepEqual(migrated.db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      migrated.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite v3 migration tags only safely inferred current-generation sprint sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-generation-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const setupStore = new SQLiteStore(databasePath);
    setupStore.migrate();
    setupStore.seedPuzzles(await loadFixturePuzzles());
    setupStore.close();
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      INSERT INTO ratings (key, generation, rating, games, rating_deviation, volatility)
      VALUES
        ('standard 5/20', 0, 700, 1, 300, 0.06),
        ('standard 5/20', 1, 650, 1, 250, 0.06),
        ('arrow duel 5/30', 0, 620, 1, 300, 0.06);
      INSERT INTO sprint_sessions (
        id, mode, rating_key, rating_generation, config_json, started_at, deadline_at,
        completed_at, status, correct_count, mistake_count, rating_before, rating_after
      ) VALUES
        ('pre-reset', 'standard', 'standard 5/20', NULL, '{}',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z', '2026-07-01T00:01:00.000Z',
          'won', 1, 0, 600, 700),
        ('current-generation', 'standard', 'standard 5/20', NULL, '{}',
          '2026-07-02T00:00:00.000Z', '2026-07-02T00:01:00.000Z', '2026-07-02T00:01:00.000Z',
          'won', 1, 0, 600, 650),
        ('current-active', 'standard', 'standard 5/20', NULL, '{}',
          '2026-07-03T00:00:00.000Z', '2026-07-03T00:05:00.000Z', NULL,
          'active', 0, 0, 650, NULL),
        ('generation-zero', 'arrow_duel', 'arrow duel 5/30', NULL, '{}',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z', '2026-07-01T00:01:00.000Z',
          'won', 1, 0, 600, 620);
      DROP INDEX sprint_sessions_rating_generation_completed_at_id_idx;
      ALTER TABLE sprint_sessions DROP COLUMN rating_generation;
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
      INSERT INTO review_queue (
        puzzle_id, mode, rating_key, due_at, interval_hours, review_count,
        success_streak, lapse_count, last_result, last_reviewed_at
      ) VALUES (
        '00008', 'standard', 'standard 5/20', '2026-06-22T03:00:00.000Z', 30, 2,
        1, 1, 'correct', '2026-06-20T12:00:00.000Z'
      );
      INSERT INTO review_events (
        id, puzzle_id, mode, rating_key, result, reviewed_at, next_due_at, interval_hours
      ) VALUES (
        'legacy-review', '00008', 'standard', 'standard 5/20', 'correct',
        '2026-06-20T12:00:00.000Z', '2026-06-25T04:00:00.000Z', 72
      );
      DROP INDEX attempts_unclear_completed_at_idx;
      ALTER TABLE attempts DROP COLUMN unclear_updated_at;
      ALTER TABLE attempts DROP COLUMN unclear;
      DROP TABLE review_schedule_removals;
      PRAGMA user_version = 2;
    `);
    legacy.close();

    const migrated = new SQLiteStore(databasePath);
    migrated.migrate();
    try {
      const generations = migrated.db
        .prepare("SELECT id, rating_generation FROM sprint_sessions ORDER BY id")
        .all()
        .map(sqliteRow);
      assert.deepEqual(generations, [
        { id: "current-active", rating_generation: 1 },
        { id: "current-generation", rating_generation: 1 },
        { id: "generation-zero", rating_generation: 0 },
        { id: "pre-reset", rating_generation: null }
      ]);
      assert.deepEqual(sqliteRow(migrated.db.prepare(
        "SELECT due_day, interval_days FROM review_queue WHERE puzzle_id = '00008'"
      ).get()), { due_day: "2026-06-21", interval_days: 2 });
      assert.deepEqual(sqliteRow(migrated.db.prepare(
        "SELECT next_due_day, interval_days FROM review_events WHERE id = 'legacy-review'"
      ).get()), { next_due_day: "2026-06-25", interval_days: 3 });
    } finally {
      migrated.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite migrates the released iOS 1.0.0 database without losing user semantics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-released-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    assert.equal(sha256(await readFile(RELEASED_V0_FIXTURE)), RELEASED_V0_SHA256);
    await copyFile(RELEASED_V0_FIXTURE, databasePath);

    const before = new DatabaseSync(databasePath);
    try {
      assert.equal(schemaVersion(before), 0);
      assert.equal(rowCount(before, "ratings"), 5);
      assert.equal(rowCount(before, "attempts"), 6);
      assert.equal(rowCount(before, "sprint_sessions"), 9);
    } finally {
      before.close();
    }

    const store = new SQLiteStore(databasePath);
    store.migrate();
    const service = new PracticeService(store);
    try {
      assert.equal(schemaVersionForStore(store), CURRENT_SCHEMA_VERSION);
      assert.equal(integrityResultForStore(store), "ok");
      assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);

      const ratingColumns = store.db.prepare("PRAGMA table_info(ratings)").all() as Array<{ name: string }>;
      assert.ok(ratingColumns.some((column) => column.name === "rating_deviation"));
      assert.ok(ratingColumns.some((column) => column.name === "volatility"));
      const attemptColumns = store.db.prepare("PRAGMA table_info(attempts)").all() as Array<{ name: string }>;
      assert.ok(attemptColumns.some((column) => column.name === "unclear"));
      assert.ok(attemptColumns.some((column) => column.name === "unclear_updated_at"));
      const sessionColumns = store.db.prepare("PRAGMA table_info(sprint_sessions)").all() as Array<{ name: string }>;
      assert.ok(sessionColumns.some((column) => column.name === "run_id"));
      assert.ok(sessionColumns.some((column) => column.name === "run_kind"));
      assert.ok(sessionColumns.some((column) => column.name === "run_name"));
      assert.deepEqual(service.listPracticeRuns().map((run) => ({
        name: run.name,
        mode: run.mode,
        ratingKey: run.ratingKey,
        themes: run.themes,
        homeOrder: run.homeOrder
      })), [
        {
          name: "Standard",
          mode: "standard",
          ratingKey: "standard 5/20",
          themes: undefined,
          homeOrder: 0
        },
        {
          name: "Arrow Duel",
          mode: "arrow_duel",
          ratingKey: "arrow_duel 5/30",
          themes: undefined,
          homeOrder: 1
        },
        {
          name: "Regular Puzzle 1",
          mode: "custom",
          ratingKey: "endgame custom 10/30",
          themes: ["endgame"],
          homeOrder: 2
        },
        {
          name: "Regular Puzzle 2",
          mode: "custom",
          ratingKey: "hangingPiece custom 5/20",
          themes: ["hangingPiece"],
          homeOrder: 3
        }
      ]);
      assert.equal(service.getRating("endgame custom 10/30").rating, 900);
      assert.equal(service.getRating("hangingPiece custom 5/20").rating, 805);
      assert.deepEqual(store.db.prepare("PRAGMA foreign_key_list(practice_runs)").all(), []);
      const reviewQueueColumns = store.db.prepare("PRAGMA table_info(review_queue)").all() as Array<{ name: string; notnull: number }>;
      assert.ok(reviewQueueColumns.some((column) => column.name === "due_day"));
      assert.ok(reviewQueueColumns.some((column) => column.name === "interval_days"));
      assert.ok(reviewQueueColumns.some((column) => column.name === "enrolled_at"));
      assert.equal(reviewQueueColumns.find((column) => column.name === "last_result")?.notnull, 0);
      assert.equal(reviewQueueColumns.find((column) => column.name === "last_reviewed_at")?.notnull, 0);
      assert.ok(!reviewQueueColumns.some((column) => column.name === "due_at"));
      assert.deepEqual(
        store.db.prepare("PRAGMA table_info(review_schedule_removals)").all().map((row) => (row as { name: string }).name),
        ["puzzle_id", "mode", "rating_key", "removed_at"]
      );
      assert.deepEqual(service.getRating("standard 5/20"), {
        key: "standard 5/20",
        generation: 1,
        rating: 710,
        ratingDeviation: 350,
        volatility: 0.06,
        games: 2
      });
      assert.deepEqual(service.getRating("arrow duel 5/30"), {
        key: "arrow duel 5/30",
        generation: 0,
        rating: 740,
        ratingDeviation: 350,
        volatility: 0.06,
        games: 1
      });
      assert.deepEqual(service.getSettings(), {
        sync: { iCloudEnabled: true },
        notifications: { reviewReminder: { mode: "fixed", fixedLocalTime: "20:30" } },
        moveFeedback: { soundEnabled: true, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: false,
          activeSessionSeen: false,
          arrowDuelSeen: false,
          focusedRunSeen: false
        }
      });
      assert.deepEqual(
        service.listSprintSessions().filter((session) => session.status === "active" || session.status === "paused").map((session) => ({
          id: session.id,
          status: session.status
        })),
        [
          { id: "legacy-standard-active", status: "active" },
          { id: "legacy-custom-paused", status: "paused" }
        ]
      );
      assert.deepEqual(service.listCustomSprintConfigs(), [
        {
          id: "legacy-custom-endgame",
          mode: "custom",
          ratingKey: "endgame custom 10/30",
          durationSeconds: 600,
          perPuzzleSeconds: 30,
          targetCorrect: 10,
          maxMistakes: 2,
          themes: ["endgame"],
          lastStartedAt: "2026-06-06T12:00:00.000Z",
          playCount: 1
        },
        {
          id: "legacy-custom-hanging",
          mode: "custom",
          ratingKey: "hangingPiece custom 5/20",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 5,
          maxMistakes: 3,
          themes: ["hangingPiece"],
          lastStartedAt: "2026-06-04T12:00:00.000Z",
          playCount: 3
        }
      ]);
      assert.deepEqual(
        service.getDueReviews("2026-06-12T00:00:00.000Z").map((review) => ({
          puzzleId: review.puzzleId,
          mode: review.mode,
          ratingKey: review.ratingKey,
          dueDay: review.dueDay
        })),
        [
          {
            puzzleId: "legacy-arrow",
            mode: "standard",
            ratingKey: "standard 5/20",
            dueDay: "2026-06-10"
          },
          {
            puzzleId: "legacy-arrow",
            mode: "arrow_duel",
            ratingKey: "arrow duel 5/30",
            dueDay: "2026-06-11"
          }
        ]
      );
      const migratedStandardHistory = service.getHistoryView({
        now: "2026-07-01T00:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20"
      }).attempts;
      assert.deepEqual(
        migratedStandardHistory.map((attempt) => attempt.id),
        [
          "legacy-attempt-review-correct",
          "legacy-attempt-standard-wrong",
          "legacy-attempt-standard-correct"
        ]
      );
      assert.ok(
        migratedStandardHistory
          .filter((attempt) => attempt.source === "sprint")
          .every((attempt) => attempt.perPuzzleSeconds === 20)
      );
      assert.equal(
        migratedStandardHistory.find((attempt) => attempt.source === "scheduled_review")?.perPuzzleSeconds,
        undefined
      );
      assert.deepEqual(
        store.listAttempts({ mode: "arrow_duel" })[0]?.arrowDuelCandidateOrder,
        ["b2b1", "f2g3", "h6c1"]
      );
      assert.ok(store.listAttempts().every((attempt) => attempt.unclear !== true));
      assert.ok(store.listAttempts().every((attempt) => attempt.unclearUpdatedAt === undefined));
      assert.ok(service.listReviewQueue().every((review) => review.enrolledAt === undefined));

      service.saveSettings({
        sync: { iCloudEnabled: false },
        notifications: { reviewReminder: { mode: "off" } },
        moveFeedback: { soundEnabled: false, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: true,
          activeSessionSeen: false,
          arrowDuelSeen: false,
          focusedRunSeen: false
        }
      });
      service.recordReviewAttempt(
        {
          puzzleId: "legacy-standard",
          mode: "standard",
          ratingKey: "standard 5/20",
          result: "wrong",
          submittedMove: "e2e5",
          expectedMove: "e2e6",
          startedAt: "2026-07-01T12:00:00.000Z"
        },
        "2026-07-01T12:00:05.000Z"
      );
      assert.equal(store.listAttempts().length, 7);
      assert.deepEqual(service.getSettings().sync, { iCloudEnabled: false });
    } finally {
      store.close();
    }

    const afterWrite = databaseSnapshot(databasePath);
    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    reopened.migrate();
    reopened.close();
    assert.deepEqual(databaseSnapshot(databasePath), afterWrite);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite migrates the released iOS 1.2.1 database without losing user semantics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-ios-121-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  let postMigrationAttemptId: string | undefined;
  try {
    assert.equal(
      sha256(await readFile(RELEASED_IOS_121_FIXTURE)),
      RELEASED_IOS_121_SHA256
    );
    await copyFile(RELEASED_IOS_121_FIXTURE, databasePath);

    const before = new DatabaseSync(databasePath);
    try {
      assert.equal(schemaVersion(before), 8);
      assert.equal(integrityResult(before), "ok");
      assert.deepEqual(before.prepare("PRAGMA foreign_key_check").all(), []);
      assert.deepEqual(
        computeSchemaSnapshot(new NodeSqliteDatabase(before)),
        await goldenSchemaSnapshot(8)
      );
      assert.equal(rowCount(before, "ratings"), 4);
      assert.equal(rowCount(before, "attempts"), 5);
      assert.equal(rowCount(before, "sprint_sessions"), 7);
      assert.equal(rowCount(before, "practice_runs"), 3);
      assert.equal(rowCount(before, "review_queue"), 2);
    } finally {
      before.close();
    }

    const store = new SQLiteStore(databasePath);
    store.migrate();
    const service = new PracticeService(store);
    try {
      assert.equal(schemaVersionForStore(store), CURRENT_SCHEMA_VERSION);
      assert.equal(integrityResultForStore(store), "ok");
      assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.deepEqual(
        computeSchemaSnapshot(store.db),
        await goldenSchemaSnapshot(CURRENT_SCHEMA_VERSION)
      );

      assert.deepEqual(service.getSettings(), {
        sync: { iCloudEnabled: false },
        notifications: {
          reviewReminder: { mode: "fixed", fixedLocalTime: "07:35" }
        },
        moveFeedback: { soundEnabled: true, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: false,
          activeSessionSeen: false,
          arrowDuelSeen: false,
          focusedRunSeen: false
        }
      });
      assert.deepEqual(service.getRating("standard 5/20"), {
        key: "standard 5/20",
        generation: 1,
        rating: 708,
        ratingDeviation: 84,
        volatility: 0.055,
        games: 2
      });
      assert.deepEqual(service.listCustomSprintConfigs(), [
        {
          id: "ios-121-custom-config",
          mode: "custom",
          ratingKey: "fork custom 7/25",
          durationSeconds: 420,
          perPuzzleSeconds: 25,
          targetCorrect: 7,
          maxMistakes: 2,
          themes: ["fork"],
          lastStartedAt: "2026-07-19T10:00:00.000Z",
          playCount: 3
        }
      ]);
      assert.deepEqual(
        service.listPracticeRuns().map((run) => ({
          id: run.id,
          name: run.name,
          ratingKey: run.ratingKey,
          perPuzzleSeconds: run.perPuzzleSeconds,
          puzzleTiming: run.puzzleTiming
        })),
        [
          {
            id: "standard",
            name: "Standard",
            ratingKey: "standard 5/20",
            perPuzzleSeconds: 20,
            puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 }
          },
          {
            id: "arrow-duel",
            name: "Arrow Duel",
            ratingKey: "arrow_duel 5/30",
            perPuzzleSeconds: 30,
            puzzleTiming: { slowAfterSeconds: 60, timeoutAfterSeconds: 90 }
          },
          {
            id: "ios-121-custom-run",
            name: "Fork Trainer",
            ratingKey: "fork custom 7/25",
            perPuzzleSeconds: 25,
            puzzleTiming: { slowAfterSeconds: 50, timeoutAfterSeconds: 75 }
          }
        ]
      );

      const standardHistory = service.getHistoryView({
        now: "2026-07-24T12:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20"
      }).attempts;
      assert.deepEqual(
        standardHistory.map((attempt) => ({
          id: attempt.id,
          result: attempt.result,
          source: attempt.source,
          perPuzzleSeconds: attempt.perPuzzleSeconds,
          runId: attempt.runId,
          runName: attempt.runName,
          unclear: attempt.unclear
        })),
        [
          {
            id: "ios-121-review-correct",
            result: "correct",
            source: "scheduled_review",
            perPuzzleSeconds: undefined,
            runId: undefined,
            runName: undefined,
            unclear: false
          },
          {
            id: "ios-121-standard-wrong",
            result: "wrong",
            source: "sprint",
            perPuzzleSeconds: 20,
            runId: "standard",
            runName: "Standard",
            unclear: false
          },
          {
            id: "ios-121-standard-correct",
            result: "correct",
            source: "sprint",
            perPuzzleSeconds: 20,
            runId: "standard",
            runName: "Standard",
            unclear: true
          }
        ]
      );
      assert.deepEqual(
        service.listHistory({ mode: "arrow_duel" })[0]?.arrowDuelCandidateOrder,
        ["b2b1", "f2g3", "h6c1"]
      );
      assert.deepEqual(
        service.getDueReviews("2026-07-24T12:00:00.000Z").map((review) => ({
          puzzleId: review.puzzleId,
          mode: review.mode,
          ratingKey: review.ratingKey,
          dueDay: review.dueDay,
          enrolledAt: review.enrolledAt
        })),
        [
          {
            puzzleId: "ios-121-standard-puzzle",
            mode: "standard",
            ratingKey: "standard 5/20",
            dueDay: "2026-07-21",
            enrolledAt: undefined
          },
          {
            puzzleId: "ios-121-arrow-puzzle",
            mode: "arrow_duel",
            ratingKey: "arrow_duel 5/30",
            dueDay: "2026-07-22",
            enrolledAt: "2026-07-21T09:00:00.000Z"
          }
        ]
      );
      assert.deepEqual(
        service.listSprintSessions()
          .filter((session) => session.status === "active" || session.status === "paused")
          .map((session) => ({ id: session.id, status: session.status, run: session.run })),
        [
          {
            id: "ios-121-custom-paused",
            status: "paused",
            run: {
              id: "ios-121-custom-run",
              kind: "custom",
              name: "Fork Trainer"
            }
          },
          {
            id: "ios-121-standard-active",
            status: "active",
            run: { id: "standard", kind: "standard", name: "Standard" }
          }
        ]
      );
      assert.deepEqual(
        service.getPracticeProgressSummary(
          Date.parse("2026-07-24T12:00:00.000Z"),
          "standard 5/20"
        ),
        {
          correctThisWeek: 2,
          accuracyThisWeek: 67,
          ratingDeltaThisWeek: 8,
          wrongThisWeek: 1,
          netThisWeek: 1
        }
      );
      assert.deepEqual(
        service.getSprintResultSummary({
          id: "ios-121-standard-failed",
          correctCount: 0,
          mistakeCount: 1
        }),
        {
          accuracyPercent: 0,
          attemptCount: 1,
          unclear: {
            slowMarkedCount: 0,
            timedOutMarkedCount: 0,
            userMarkedCount: 0
          },
          review: {
            addedCount: 1,
            mistakeCount: 1,
            timedOutCount: 0
          }
        }
      );

      const postMigrationAttempt = service.recordReviewAttempt(
        {
          puzzleId: "ios-121-custom-puzzle",
          mode: "custom",
          ratingKey: "fork custom 7/25",
          result: "wrong",
          submittedMove: "c2c4",
          expectedMove: "c2c3",
          startedAt: "2026-07-24T12:10:00.000Z"
        },
        "2026-07-24T12:10:05.000Z"
      );
      postMigrationAttemptId = postMigrationAttempt.attempt.id;
      service.saveSettings({
        ...service.getSettings(),
        moveFeedback: { soundEnabled: false, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: true,
          activeSessionSeen: true,
          arrowDuelSeen: false,
          focusedRunSeen: true
        }
      });
      assert.equal(service.listHistory().length, 6);
      assert.equal(service.getSettings().moveFeedback.soundEnabled, false);
    } finally {
      store.close();
    }

    const afterWrite = databaseSnapshot(databasePath);
    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    reopened.migrate();
    const reopenedService = new PracticeService(reopened);
    assert.equal(reopenedService.listHistory().length, 6);
    assert.equal(
      reopenedService.getHistoryAttempt(postMigrationAttemptId ?? assert.fail("expected a post-migration write"))?.result,
      "wrong"
    );
    assert.deepEqual(reopenedService.getSettings().sprintGuides, {
      rulesSeen: true,
      activeSessionSeen: true,
      arrowDuelSeen: false,
      focusedRunSeen: true
    });
    reopened.close();
    assert.deepEqual(databaseSnapshot(databasePath), afterWrite);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite migration rolls back schema, data, and version after an injected failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-failed-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const nativeDb = new DatabaseSync(databasePath);
    nativeDb.exec(`
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
    const delegate = new NodeSqliteDatabase(nativeDb);
    let injected = false;
    const failingDb: SyncSqliteDatabase = {
      exec(sql) {
        delegate.exec(sql);
        if (!injected && sql.startsWith("PRAGMA user_version =")) {
          injected = true;
          throw new Error("injected migration failure");
        }
      },
      prepare(sql) {
        return delegate.prepare(sql);
      }
    };
    const store = new SyncSQLiteStore(failingDb, { randomId: () => "migration-test-id" });

    assert.throws(() => store.migrate(), /injected migration failure/);
    assert.equal(schemaVersion(nativeDb), 0);
    assert.deepEqual(
      nativeDb.prepare("SELECT key, generation, rating, games FROM ratings").all().map(sqliteRow),
      [{ key: "standard 5/20", generation: 0, rating: 900, games: 4 }]
    );
    assert.deepEqual(
      nativeDb.prepare("PRAGMA table_info(ratings)").all().map((row) => (row as { name: string }).name),
      ["key", "generation", "rating", "games"]
    );
    assert.equal(
      (nativeDb.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'attempts'").get() as { count: number }).count,
      0
    );
    nativeDb.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite rejects an unsupported future schema without changing its data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-future-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const future = new DatabaseSync(databasePath);
    future.exec(`
      CREATE TABLE future_data (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO future_data (id, value) VALUES ('keep-me', 'future-value');
      PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1};
    `);
    future.close();

    const store = new SQLiteStore(databasePath);
    assert.throws(
      () => store.migrate(),
      new RegExp(`schema version ${CURRENT_SCHEMA_VERSION + 1} is newer than supported version ${CURRENT_SCHEMA_VERSION}`)
    );
    store.close();

    const verified = new DatabaseSync(databasePath);
    try {
      assert.equal(schemaVersion(verified), CURRENT_SCHEMA_VERSION + 1);
      assert.deepEqual(
        verified.prepare("SELECT id, value FROM future_data").all().map(sqliteRow),
        [{ id: "keep-me", value: "future-value" }]
      );
      assert.equal(
        (verified.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ratings'").get() as { count: number }).count,
        0
      );
    } finally {
      verified.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite migrates a large released-schema history without dropping attempts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-large-migration-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    await copyFile(RELEASED_V0_FIXTURE, databasePath);
    const legacy = new DatabaseSync(databasePath);
    legacy.exec("BEGIN IMMEDIATE");
    try {
      const insert = legacy.prepare(`
        INSERT INTO attempts (
          id,
          source,
          session_id,
          puzzle_id,
          mode,
          rating_key,
          result,
          submitted_move,
          expected_move,
          started_at,
          completed_at,
          rating_before,
          rating_after,
          arrow_duel_candidate_order_json
        ) VALUES (?, 'sprint', 'legacy-standard-latest', 'legacy-standard', 'standard',
          'standard 5/20', 'correct', 'e2e6', 'e2e6', ?, ?, 710, NULL, NULL)
      `);
      for (let index = 0; index < 10_000; index += 1) {
        const timestamp = new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString();
        insert.run(`large-attempt-${index.toString().padStart(5, "0")}`, timestamp, timestamp);
      }
      legacy.exec("COMMIT");
    } catch (error) {
      legacy.exec("ROLLBACK");
      throw error;
    } finally {
      legacy.close();
    }

    const store = new SQLiteStore(databasePath);
    store.migrate();
    store.close();

    const verified = new DatabaseSync(databasePath);
    try {
      assert.equal(schemaVersion(verified), CURRENT_SCHEMA_VERSION);
      assert.equal(rowCount(verified, "attempts"), 10_006);
      assert.equal(integrityResult(verified), "ok");
      assert.deepEqual(verified.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      verified.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite schema at the current version matches the committed golden snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-schema-snapshot-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const store = new SQLiteStore(databasePath);
    store.migrate();
    const snapshot = computeSchemaSnapshot(store.db);
    store.close();

    assert.deepEqual(snapshot, await goldenSchemaSnapshot(CURRENT_SCHEMA_VERSION));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite repairs divergent timing schemas that omitted move feedback columns", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-divergent-timing-schema-"));
  try {
    for (const divergentVersion of [CURRENT_SCHEMA_VERSION - 1, CURRENT_SCHEMA_VERSION]) {
      const databasePath = join(directory, `practice-v${divergentVersion}.sqlite`);
      const initialStore = new SQLiteStore(databasePath);
      initialStore.migrate();
      const initialService = new PracticeService(initialStore);
      initialService.getSettings();
      initialStore.close();

      const divergentDatabase = new DatabaseSync(databasePath);
      divergentDatabase.exec(`
        ALTER TABLE app_settings DROP COLUMN move_feedback_sound_enabled;
        ALTER TABLE app_settings DROP COLUMN move_feedback_haptics_enabled;
        PRAGMA user_version = ${divergentVersion};
      `);
      divergentDatabase.close();

      const repairedStore = new SQLiteStore(databasePath);
      repairedStore.migrate();
      const repairedService = new PracticeService(repairedStore);
      try {
        assert.deepEqual(repairedService.getSettings().moveFeedback, {
          soundEnabled: true,
          hapticsEnabled: true
        });
        assert.doesNotThrow(() => {
          repairedService.saveSettings({
            ...repairedService.getSettings(),
            moveFeedback: {
              soundEnabled: false,
              hapticsEnabled: true
            }
          });
        });
        assert.deepEqual(repairedService.getSettings().moveFeedback, {
          soundEnabled: false,
          hapticsEnabled: true
        });
      } finally {
        repairedStore.close();
      }

      const repairedDatabase = new DatabaseSync(databasePath);
      try {
        assert.equal(schemaVersion(repairedDatabase), CURRENT_SCHEMA_VERSION);
        assert.equal(integrityResult(repairedDatabase), "ok");
        assert.deepEqual(repairedDatabase.prepare("PRAGMA foreign_key_check").all(), []);
        const columns = repairedDatabase.prepare("PRAGMA table_info(app_settings)").all() as Array<{ name: string }>;
        assert.ok(columns.some((column) => column.name === "move_feedback_sound_enabled"));
        assert.ok(columns.some((column) => column.name === "move_feedback_haptics_enabled"));
      } finally {
        repairedDatabase.close();
      }

      const reopenedStore = new SQLiteStore(databasePath);
      reopenedStore.migrate();
      const reopenedService = new PracticeService(reopenedStore);
      try {
        assert.deepEqual(reopenedService.getSettings().moveFeedback, {
          soundEnabled: false,
          hapticsEnabled: true
        });
      } finally {
        reopenedStore.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite schema after migrating the released iOS 1.0.0 database matches the fresh-install golden snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-schema-snapshot-legacy-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    await copyFile(RELEASED_V0_FIXTURE, databasePath);

    const store = new SQLiteStore(databasePath);
    store.migrate();
    const snapshot = computeSchemaSnapshot(store.db);
    store.close();

    assert.deepEqual(
      snapshot,
      await goldenSchemaSnapshot(CURRENT_SCHEMA_VERSION),
      "a legacy database migrated to the current version must end up with the exact same table shape as a fresh install; " +
        "if this fails after an intentional schema change, add a new migration and a new golden snapshot instead of editing this one"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function goldenSchemaSnapshot(version: number): Promise<SchemaSnapshot> {
  const contents = await readFile(join(GOLDEN_SCHEMA_SNAPSHOTS_DIR, `v${version}.json`), "utf8");
  return JSON.parse(contents) as SchemaSnapshot;
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  return JSON.parse(await readFile(PUZZLE_FIXTURE, "utf8")) as Puzzle[];
}

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function schemaVersion(db: DatabaseSync): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function schemaVersionForStore(store: SQLiteStore): number {
  return (store.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function integrityResult(db: DatabaseSync): string {
  return (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
}

function integrityResultForStore(store: SQLiteStore): string {
  return (store.db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
}

function rowCount(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function rowName(row: unknown): string {
  return (row as { name: string }).name;
}

function sqliteRow(row: unknown): Record<string, unknown> {
  return { ...(row as Record<string, unknown>) };
}

function databaseSnapshot(databasePath: string): unknown {
  const db = new DatabaseSync(databasePath);
  try {
    return {
      version: schemaVersion(db),
      schema: db
        .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name")
        .all()
        .map(sqliteRow),
      rows: Object.fromEntries(
        SNAPSHOT_TABLES.map((table) => [
          table,
          db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(sqliteRow)
        ])
      )
    };
  } finally {
    db.close();
  }
}
