import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CURRENT_SCHEMA_VERSION,
  NodeSqliteDatabase,
  PracticeService,
  SQLiteStore
} from "../src/index.ts";
import { SyncSQLiteStore, type SyncSqliteDatabase } from "../src/sync-sqlite-store.ts";

const RELEASED_V0_FIXTURE = resolve(
  "packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
);
const RELEASED_V0_SHA256 = "f9746607dcd98c642a1b111be348dd7476ee12a239c10346b64abe069e6cad5f";
const SNAPSHOT_TABLES = [
  "app_settings",
  "puzzles",
  "ratings",
  "sprint_sessions",
  "attempts",
  "custom_sprint_configs",
  "review_queue",
  "review_events"
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
        notifications: { reviewReminder: { mode: "fixed", fixedLocalTime: "20:30" } }
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
          theme: "endgame",
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
          theme: "hangingPiece",
          lastStartedAt: "2026-06-04T12:00:00.000Z",
          playCount: 3
        }
      ]);
      assert.deepEqual(
        service.getDueReviews("2026-06-12T00:00:00.000Z").map((review) => ({
          puzzleId: review.puzzleId,
          mode: review.mode,
          ratingKey: review.ratingKey,
          dueAt: review.dueAt
        })),
        [
          {
            puzzleId: "legacy-arrow",
            mode: "standard",
            ratingKey: "standard 5/20",
            dueAt: "2026-06-10T12:00:00.000Z"
          },
          {
            puzzleId: "legacy-arrow",
            mode: "arrow_duel",
            ratingKey: "arrow duel 5/30",
            dueAt: "2026-06-11T12:00:00.000Z"
          }
        ]
      );
      assert.deepEqual(
        service.getHistoryView({
          now: "2026-07-01T00:00:00.000Z",
          timeRange: "max",
          ratingKey: "standard 5/20"
        }).attempts.map((attempt) => attempt.id),
        [
          "legacy-attempt-review-correct",
          "legacy-attempt-standard-wrong",
          "legacy-attempt-standard-correct"
        ]
      );
      assert.deepEqual(
        store.listAttempts({ mode: "arrow_duel" })[0]?.arrowDuelCandidateOrder,
        ["b2b1", "f2g3", "h6c1"]
      );

      service.saveSettings({
        sync: { iCloudEnabled: false },
        notifications: { reviewReminder: { mode: "off" } }
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
