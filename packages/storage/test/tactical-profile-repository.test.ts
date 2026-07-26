import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TacticalProfileDailyCell } from "../../core/src/index.ts";
import { NodeSqliteDatabase } from "../src/sqlite-store.ts";
import {
  MemoryTacticalProfileRepository,
  SQLiteTacticalProfileRepository,
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
        entry.distinctPuzzleIds
      ]),
      [
        ["2026-07-01", "fork", 1, ["p-fork"]],
        ["2026-07-02", "pin", 2, ["p-pin"]]
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

test("SQLite Tactical Profile cache migrates schema v1 build state", () => {
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
    5
  );
  assert.deepEqual(repository.getBuildState(), {
    ...IDENTITY,
    status: "ready",
    dirtyDayCount: 0,
    sourceRevision: -1,
    watermarkDay: "2026-07-01"
  });
});

test("SQLite Tactical Profile cache migrates schema v3 build state through v5", () => {
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
    5
  );
  assert.deepEqual(repository.getBuildState(), {
    ...IDENTITY,
    status: "ready",
    dirtyDayCount: 0,
    sourceRevision: 9,
    watermarkDay: "2026-07-03",
    evaluatedAt: "2026-07-04T00:00:00.000Z",
    recommendedSignalIds: ["line:fork"]
  });
});

test("SQLite Tactical Profile cache migrates schema v4 state to focused Run watermarks", () => {
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
    5
  );
  assert.deepEqual(repository.getBuildState(), {
    ...IDENTITY,
    status: "ready",
    dirtyDayCount: 0,
    sourceRevision: 10,
    ratingAnchors: {
      line: {
        sessionId: "mixed-1",
        ratingKey: "standard 5/20",
        completedAt: "2026-07-04T00:00:00.000Z"
      }
    }
  });
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
    solveScore,
    solveInformation: 0.25,
    solveExpectedSuccess: 0.5,
    solveObservedSuccess: 0,
    solveSensitivity: 1,
    solveWeight: 1,
    speedWeightedResidual: 0,
    speedPrecision: 0,
    speedWeight: 0,
    distinctPuzzleIds: [`p-${theme}`],
    distinctSessionIds: [`s-${completedDay}`]
  };
}
