import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TacticalProfileDailyCell } from "../../core/src/index.ts";
import { NodeSqliteDatabase } from "../src/sqlite-store.ts";
import {
  MemoryTacticalProfileRepository,
  SQLiteTacticalProfileRepository,
  TACTICAL_PROFILE_CACHE_SCHEMA_VERSION,
  type TacticalProfileCacheIdentity,
  type TacticalProfileRepository
} from "../src/tactical-profile-repository.ts";

const IDENTITY: TacticalProfileCacheIdentity = {
  modelVersion: "model-v1",
  packFeatureHash: "sha256:pack",
  calibrationId: "calibration-v1"
};

for (const fixture of repositoryFixtures()) {
  test(`${fixture.name} Tactical Profile cache replaces dirty days deterministically`, () => {
    const repository = fixture.create();
    repository.migrate();
    repository.reset(
      IDENTITY,
      ["2026-07-02", "2026-07-01", "2026-07-02"],
      7
    );

    assert.deepEqual(repository.listDirtyDays(IDENTITY), ["2026-07-02", "2026-07-01"]);
    repository.replaceDay(IDENTITY, "2026-07-02", [cell("2026-07-02", "pin", 2)]);
    repository.replaceDay(IDENTITY, "2026-07-01", [cell("2026-07-01", "fork", 1)]);
    repository.saveBuildState({
      ...IDENTITY,
      status: "ready",
      dirtyDayCount: 0,
      sourceRevision: 7,
      watermarkDay: "2026-07-02",
      evaluatedAt: "2026-07-03T00:00:00.000Z",
      recommendedSignalIds: ["line:pin", "line:fork", "line:pin"],
      ratingAnchors: {
        line: {
          sessionId: "latest-line-session",
          ratingKey: "standard 5/20",
          completedAt: "2026-07-02T00:05:00.000Z"
        }
      },
      focusedRunWatermarks: {
        arrow_duel: {
          sessionId: "latest-arrow-focus",
          completedAt: "2026-07-02T00:06:00.000Z"
        }
      }
    });

    assert.deepEqual(repository.listDirtyDays(IDENTITY), []);
    assert.deepEqual(repository.getBuildState()?.recommendedSignalIds, [
      "line:fork",
      "line:pin"
    ]);
    assert.equal(
      repository.getBuildState()?.evaluatedAt,
      "2026-07-03T00:00:00.000Z"
    );
    assert.deepEqual(repository.getBuildState()?.ratingAnchors, {
      line: {
        sessionId: "latest-line-session",
        ratingKey: "standard 5/20",
        completedAt: "2026-07-02T00:05:00.000Z"
      }
    });
    assert.deepEqual(repository.getBuildState()?.focusedRunWatermarks, {
      arrow_duel: {
        sessionId: "latest-arrow-focus",
        completedAt: "2026-07-02T00:06:00.000Z"
      }
    });
    assert.deepEqual(
      repository.listDailyCells(IDENTITY).map((entry) => [
        entry.completedDay,
        entry.theme,
        entry.solveScore,
        entry.accuracySuccessWeight,
        entry.accuracyWeight,
        entry.distinctPuzzleIds
      ]),
      [
        ["2026-07-01", "fork", 1, 1, 1, ["p-fork"]],
        ["2026-07-02", "pin", 2, 1, 1, ["p-pin"]]
      ]
    );

    repository.markDirtyDays(IDENTITY, ["2026-07-01", "bad-day"], 8);
    assert.equal(
      repository.getBuildState()?.ratingAnchors?.line?.sessionId,
      "latest-line-session"
    );
    assert.equal(
      repository.getBuildState()?.focusedRunWatermarks?.arrow_duel?.sessionId,
      "latest-arrow-focus"
    );
    repository.replaceDay(IDENTITY, "2026-07-01", [cell("2026-07-01", "fork", 4)]);
    assert.equal(repository.listDailyCells(IDENTITY)[0]?.solveScore, 4);
  });

  test(`${fixture.name} Tactical Profile day replacement rolls back atomically`, () => {
    const repository = fixture.create();
    repository.migrate();
    repository.reset(IDENTITY, ["2026-07-01"], 7);
    repository.replaceDay(IDENTITY, "2026-07-01", [cell("2026-07-01", "fork", 1)]);
    repository.markDirtyDays(IDENTITY, ["2026-07-01"], 8);

    assert.throws(
      () => repository.replaceDay(IDENTITY, "2026-07-01", [
        cell("2026-07-01", "pin", 2),
        {
          ...cell("2026-07-01", "fork", 3),
          calibrationId: "different-calibration"
        }
      ]),
      /identity does not match/
    );

    assert.deepEqual(
      repository.listDailyCells(IDENTITY).map((entry) => [entry.theme, entry.solveScore]),
      [["fork", 1]]
    );
    assert.deepEqual(repository.listDirtyDays(IDENTITY), ["2026-07-01"]);
  });
}

test("SQLite Tactical Profile cache rejects a future schema", () => {
  const native = new DatabaseSync(":memory:");
  native.exec("PRAGMA user_version = 99");
  const repository = new SQLiteTacticalProfileRepository(new NodeSqliteDatabase(native));
  assert.throws(() => repository.migrate(), /Unsupported Tactical Profile cache schema version 99/);
});

test("SQLite Tactical Profile cache owns only derived weakness tables", () => {
  const native = new DatabaseSync(":memory:");
  const repository = new SQLiteTacticalProfileRepository(new NodeSqliteDatabase(native));
  repository.migrate();
  const tables = native.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all().map((row) => (row as { name: string }).name);
  assert.deepEqual(tables, [
    "weakness_build_state",
    "weakness_daily_stats",
    "weakness_dirty_days"
  ]);
});

test("SQLite Tactical Profile cache migrates schema v1 and invalidates derived state", () => {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT
    );
    INSERT INTO weakness_build_state (
      singleton_id,
      model_version,
      pack_feature_hash,
      calibration_id,
      status,
      dirty_day_count,
      watermark_day
    ) VALUES (
      1,
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      'ready',
      0,
      '2026-07-01'
    );
    PRAGMA user_version = 1;
  `);
  const repository = new SQLiteTacticalProfileRepository(new NodeSqliteDatabase(native));

  repository.migrate();

  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    TACTICAL_PROFILE_CACHE_SCHEMA_VERSION
  );
  assert.equal(repository.getBuildState(), undefined);
});

test("SQLite Tactical Profile cache migrates schema v3 and invalidates derived state", () => {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT,
      evaluated_at TEXT,
      recommended_signal_ids_json TEXT
    );
    INSERT INTO weakness_build_state (
      singleton_id,
      model_version,
      pack_feature_hash,
      calibration_id,
      status,
      dirty_day_count,
      source_revision,
      watermark_day,
      evaluated_at,
      recommended_signal_ids_json
    ) VALUES (
      1,
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      'ready',
      0,
      9,
      '2026-07-03',
      '2026-07-04T00:00:00.000Z',
      '["line:fork"]'
    );
    PRAGMA user_version = 3;
  `);
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );

  repository.migrate();

  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    TACTICAL_PROFILE_CACHE_SCHEMA_VERSION
  );
  assert.equal(repository.getBuildState(), undefined);
});

test("SQLite Tactical Profile cache migrates schema v4 and invalidates derived state", () => {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT,
      evaluated_at TEXT,
      recommended_signal_ids_json TEXT,
      rating_anchors_json TEXT
    );
    INSERT INTO weakness_build_state (
      singleton_id,
      model_version,
      pack_feature_hash,
      calibration_id,
      status,
      dirty_day_count,
      source_revision,
      rating_anchors_json
    ) VALUES (
      1,
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      'ready',
      0,
      10,
      '{"line":{"sessionId":"mixed-1","ratingKey":"standard 5/20","completedAt":"2026-07-04T00:00:00.000Z"}}'
    );
    PRAGMA user_version = 4;
  `);
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );

  repository.migrate();

  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    TACTICAL_PROFILE_CACHE_SCHEMA_VERSION
  );
  assert.equal(repository.getBuildState(), undefined);
});

test("SQLite Tactical Profile cache invalidates v5 derived data for rebuild", () => {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE TABLE weakness_daily_stats (
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      completed_day TEXT NOT NULL,
      task_family TEXT NOT NULL,
      theme TEXT NOT NULL,
      solve_score REAL NOT NULL,
      solve_information REAL NOT NULL,
      solve_expected_success REAL NOT NULL,
      solve_observed_success REAL NOT NULL,
      solve_sensitivity REAL NOT NULL,
      solve_weight REAL NOT NULL,
      speed_weighted_residual REAL NOT NULL,
      speed_precision REAL NOT NULL,
      speed_weight REAL NOT NULL,
      distinct_puzzle_ids_json TEXT NOT NULL,
      distinct_session_ids_json TEXT NOT NULL,
      PRIMARY KEY (
        model_version,
        pack_feature_hash,
        calibration_id,
        completed_day,
        task_family,
        theme
      )
    );
    CREATE TABLE weakness_dirty_days (
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      completed_day TEXT NOT NULL,
      PRIMARY KEY (
        model_version,
        pack_feature_hash,
        calibration_id,
        completed_day
      )
    );
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT,
      evaluated_at TEXT,
      recommended_signal_ids_json TEXT,
      rating_anchors_json TEXT,
      focused_run_watermarks_json TEXT
    );
    INSERT INTO weakness_daily_stats VALUES (
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      '2026-07-01',
      'line',
      'fork',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      '["p1"]',
      '["s1"]'
    );
    INSERT INTO weakness_dirty_days VALUES (
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      '2026-07-02'
    );
    INSERT INTO weakness_build_state (
      singleton_id,
      model_version,
      pack_feature_hash,
      calibration_id,
      status,
      dirty_day_count,
      source_revision
    ) VALUES (
      1,
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      'ready',
      0,
      11
    );
    PRAGMA user_version = 5;
  `);
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );

  repository.migrate();
  repository.migrate();

  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    TACTICAL_PROFILE_CACHE_SCHEMA_VERSION
  );
  assert.equal(repository.getBuildState(), undefined);
  assert.equal(
    (native.prepare("SELECT COUNT(*) AS count FROM weakness_daily_stats").get() as {
      count: number;
    }).count,
    0
  );
  assert.equal(
    (native.prepare("SELECT COUNT(*) AS count FROM weakness_dirty_days").get() as {
      count: number;
    }).count,
    0
  );
  const columns = native.prepare("PRAGMA table_info(weakness_daily_stats)")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.ok(columns.includes("accuracy_success_weight"));
  assert.ok(columns.includes("accuracy_weight"));
});

test("SQLite Tactical Profile cache v7 invalidates released v6 speed rows atomically", () => {
  const native = new DatabaseSync(":memory:");
  createSchemaV6Fixture(native);
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );

  repository.migrate();

  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    TACTICAL_PROFILE_CACHE_SCHEMA_VERSION
  );
  assert.equal(repository.getBuildState(), undefined);
  assert.equal(
    (native.prepare("SELECT COUNT(*) AS count FROM weakness_daily_stats").get() as {
      count: number;
    }).count,
    0
  );
  assert.equal(
    (native.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    }).integrity_check,
    "ok"
  );
  assert.deepEqual(native.prepare("PRAGMA foreign_key_check").all(), []);
  const columns = native.prepare("PRAGMA table_info(weakness_daily_stats)")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.ok(columns.includes("speed_baseline_json"));
  assert.ok(columns.includes("speed_theme_json"));
  assert.ok(columns.includes("speed_control_exclusion_json"));
  assert.ok(!columns.includes("speed_weighted_residual"));
});

test("SQLite Tactical Profile cache migration failure preserves the v6 schema version", () => {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE VIEW weakness_daily_stats AS SELECT 1 AS placeholder;
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT,
      evaluated_at TEXT,
      recommended_signal_ids_json TEXT,
      rating_anchors_json TEXT,
      focused_run_watermarks_json TEXT
    );
    PRAGMA user_version = 6;
  `);
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );

  assert.throws(() => repository.migrate(), /view|DROP VIEW/i);
  assert.equal(
    (native.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    6
  );
  const retained = native.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE name = 'weakness_daily_stats'
  `).get() as { type: string; name: string };
  assert.equal(retained.type, "view");
  assert.equal(retained.name, "weakness_daily_stats");
});

test("SQLite Tactical Profile cache fails closed on malformed rating anchors", () => {
  const native = new DatabaseSync(":memory:");
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );
  repository.migrate();
  repository.reset(IDENTITY, [], 1);
  native.prepare(`
    UPDATE weakness_build_state
    SET rating_anchors_json = ?
    WHERE singleton_id = 1
  `).run(JSON.stringify({
    line: {
      sessionId: "session-1",
      ratingKey: "standard 5/20",
      completedAt: "not-a-timestamp"
    }
  }));

  assert.throws(
    () => repository.getBuildState(),
    /Invalid Tactical Profile rating anchor/
  );
});

test("SQLite Tactical Profile cache fails closed on malformed focused Run watermarks", () => {
  const native = new DatabaseSync(":memory:");
  const repository = new SQLiteTacticalProfileRepository(
    new NodeSqliteDatabase(native)
  );
  repository.migrate();
  repository.reset(IDENTITY, [], 1);
  native.prepare(`
    UPDATE weakness_build_state
    SET focused_run_watermarks_json = ?
    WHERE singleton_id = 1
  `).run(JSON.stringify({
    line: {
      sessionId: "focused-1",
      completedAt: "not-a-timestamp"
    }
  }));

  assert.throws(
    () => repository.getBuildState(),
    /Invalid Tactical Profile focused Run watermark/
  );
});

function repositoryFixtures(): Array<{
  name: string;
  create: () => TacticalProfileRepository;
}> {
  return [
    {
      name: "memory",
      create: () => new MemoryTacticalProfileRepository()
    },
    {
      name: "SQLite",
      create: () => new SQLiteTacticalProfileRepository(
        new NodeSqliteDatabase(new DatabaseSync(":memory:"))
      )
    }
  ];
}

function cell(
  completedDay: string,
  theme: string,
  solveScore: number
): TacticalProfileDailyCell {
  return {
    ...IDENTITY,
    completedDay,
    taskFamily: "line",
    theme,
    accuracySuccessWeight: 1,
    accuracyWeight: 1,
    solveScore,
    solveInformation: 0.25,
    solveExpectedSuccess: 0.5,
    solveObservedSuccess: 0,
    solveSensitivity: 1,
    solveWeight: 1,
    speedBaseline: emptySpeedStatistics(),
    speedTheme: emptySpeedStatistics(),
    speedControlExclusion: emptySpeedStatistics(),
    distinctPuzzleIds: [`p-${theme}`],
    distinctSessionIds: [`s-${completedDay}`]
  };
}

function emptySpeedStatistics() {
  return {
    weight: 0,
    gramMatrix: Array(36).fill(0),
    responseFeatureSums: Array(6).fill(0),
    responseSquareSum: 0
  };
}

function createSchemaV6Fixture(native: DatabaseSync): void {
  native.exec(`
    CREATE TABLE weakness_daily_stats (
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      completed_day TEXT NOT NULL,
      task_family TEXT NOT NULL,
      theme TEXT NOT NULL,
      accuracy_success_weight REAL NOT NULL,
      accuracy_weight REAL NOT NULL,
      solve_score REAL NOT NULL,
      solve_information REAL NOT NULL,
      solve_expected_success REAL NOT NULL,
      solve_observed_success REAL NOT NULL,
      solve_sensitivity REAL NOT NULL,
      solve_weight REAL NOT NULL,
      speed_weighted_residual REAL NOT NULL,
      speed_precision REAL NOT NULL,
      speed_weight REAL NOT NULL,
      distinct_puzzle_ids_json TEXT NOT NULL,
      distinct_session_ids_json TEXT NOT NULL,
      PRIMARY KEY (
        model_version,
        pack_feature_hash,
        calibration_id,
        completed_day,
        task_family,
        theme
      )
    );
    CREATE TABLE weakness_dirty_days (
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      completed_day TEXT NOT NULL,
      PRIMARY KEY (
        model_version,
        pack_feature_hash,
        calibration_id,
        completed_day
      )
    );
    CREATE TABLE weakness_build_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      model_version TEXT NOT NULL,
      pack_feature_hash TEXT NOT NULL,
      calibration_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dirty_day_count INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      watermark_day TEXT,
      last_error TEXT,
      evaluated_at TEXT,
      recommended_signal_ids_json TEXT,
      rating_anchors_json TEXT,
      focused_run_watermarks_json TEXT
    );
    INSERT INTO weakness_daily_stats VALUES (
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      '2026-07-01',
      'line',
      'fork',
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      3,
      4,
      1,
      '["p1"]',
      '["s1"]'
    );
    INSERT INTO weakness_dirty_days VALUES (
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      '2026-07-02'
    );
    INSERT INTO weakness_build_state (
      singleton_id,
      model_version,
      pack_feature_hash,
      calibration_id,
      status,
      dirty_day_count,
      source_revision
    ) VALUES (
      1,
      'model-v1',
      'sha256:pack',
      'calibration-v1',
      'ready',
      0,
      12
    );
    PRAGMA user_version = 6;
  `);
}
