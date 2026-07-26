import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildSprintConfig,
  startSprint,
  type AttemptEvent,
  type Puzzle,
  type TacticalProfileCalibrationArtifact
} from "../../core/src/index.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { PracticeService } from "../src/practice-service.ts";
import { MemoryTacticalProfileRepository } from "../src/tactical-profile-repository.ts";
import { NodeSqliteDatabase, SQLiteStore } from "../src/sqlite-store.ts";
import { TacticalProfileService } from "../src/tactical-profile-service.ts";
import { SQLiteTacticalProfileRepository } from "../src/tactical-profile-repository.ts";

test("TacticalProfileService rebuilds dirty days and converges after duplicate import", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new MemoryTacticalProfileRepository();
  const profile = service(store, repository);

  const first = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(first.phase, "ready");
  assert.equal(first.cutoffs.line.home[0]?.theme, "fork");
  const firstCells = repository.listDailyCells(identity());

  profile.markCanonicalImportChanged();
  const second = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(second.phase, "ready");
  assert.deepEqual(repository.listDailyCells(identity()), firstCells);
});

test("a clean Tactical Profile read uses daily cells without rescanning canonical history", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const first = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const originalListAttempts = store.listAttempts.bind(store);
  let rawHistoryReads = 0;
  store.listAttempts = (filter = {}) => {
    rawHistoryReads += 1;
    return originalListAttempts(filter);
  };

  const snapshot = profile.getSnapshot("2026-07-26T00:00:00.000Z");

  assert.equal(snapshot.phase, "ready");
  assert.equal(rawHistoryReads, 0);
  assert.equal(snapshot.buildState.evaluatedAt, "2026-07-25T00:00:00.000Z");
  assert.deepEqual(snapshot.evaluation, first.evaluation);
});

test("large SQLite rebuilds and imports keep canonical reads bounded", () => {
  const store = new SQLiteStore();
  try {
    store.migrate();
    store.seedPuzzles([puzzle("large-history-puzzle", ["fork"])]);
    const config = buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20
    });
    store.transaction(() => {
      for (let dayIndex = 0; dayIndex < 60; dayIndex += 1) {
        const completedAt = new Date(
          Date.UTC(2025, 0, 1 + dayIndex, 0, 4)
        ).toISOString();
        const session = startSprint({
          id: `large-session-${dayIndex}`,
          config,
          puzzles: [store.getPuzzle("large-history-puzzle")!],
          ratingBefore: 925,
          now: new Date(Date.parse(completedAt) - 240_000).toISOString()
        });
        const completed = {
          ...session,
          status: "failed" as const,
          completedAt,
          endReason: "max_mistakes" as const,
          correctCount: 0,
          mistakeCount: 50,
          ratingAfter: 900
        };
        store.createSprintSession({
          ...session
        });
        for (let attemptIndex = 0; attemptIndex < 50; attemptIndex += 1) {
          store.recordAttempt(attempt({
            id: `large-attempt-${dayIndex}-${attemptIndex}`,
            sessionId: session.id,
            puzzleId: "large-history-puzzle",
            completedAt
          }));
        }
        store.updateSprintSession(completed);
      }
    });

    const originalListAttempts = store.listAttempts.bind(store);
    const originalGetSprintSessions = store.getSprintSessions.bind(store);
    const originalListSprintAttemptUtcDays =
      store.listSprintAttemptUtcDays.bind(store);
    const filters: Parameters<typeof store.listAttempts>[0][] = [];
    const sessionReadSizes: number[] = [];
    const importDayReadSizes: number[] = [];
    store.listAttempts = (filter = {}) => {
      filters.push(filter);
      return originalListAttempts(filter);
    };
    store.getSprintSessions = (ids) => {
      sessionReadSizes.push(new Set(ids).size);
      return originalGetSprintSessions(ids);
    };
    store.listSprintAttemptUtcDays = (ids) => {
      importDayReadSizes.push(new Set(ids).size);
      return originalListSprintAttemptUtcDays(ids);
    };
    const profile = new TacticalProfileService({
      progressStore: store,
      puzzleSource: store,
      repository: new MemoryTacticalProfileRepository(),
      calibration: CALIBRATION,
      naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
      maxDirtyDaysPerRefresh: 30
    });

    const startedAt = Date.now();
    const first = profile.getSnapshot("2026-07-25T00:00:00.000Z");
    const second = profile.getSnapshot("2026-07-25T00:00:00.000Z");
    const elapsedMs = Date.now() - startedAt;

    assert.equal(first.phase, "building");
    assert.notEqual(second.phase, "building");
    assert.equal(
      filters.filter((filter) => filter?.since === undefined).length,
      1,
      "only the initial dirty-day discovery may scan canonical history"
    );
    const bounded = filters.filter((filter) => filter?.since !== undefined);
    assert.equal(bounded.length, 60);
    assert.ok(bounded.every((filter) =>
      filter?.source === "sprint" && filter.until !== undefined
    ));
    assert.deepEqual(sessionReadSizes, [30, 30]);
    assert.ok(elapsedMs < 4_000, `large dirty rebuild took ${elapsedMs}ms`);

    const incoming = store.exportLocalData();
    incoming.sprintSessions = incoming.sprintSessions.map((session) => ({
      ...session,
      completedAt: new Date(
        Date.parse(session.completedAt ?? session.startedAt) + 86_400_000
      ).toISOString(),
      config: {
        ...session.config!,
        themes: ["fork"]
      }
    }));
    filters.length = 0;
    const importStartedAt = Date.now();
    const imported = new PracticeService(store, profile).importLocalData(incoming);
    const importElapsedMs = Date.now() - importStartedAt;

    assert.equal(imported.sprintSessions, 60);
    assert.equal(imported.attempts, 0);
    assert.deepEqual(importDayReadSizes, [60]);
    assert.equal(filters.length, 0);
    assert.ok(
      importElapsedMs < 4_000,
      `large no-attempt-change import took ${importElapsedMs}ms`
    );
  } finally {
    store.close();
  }
});

test("a source-revision mismatch rebuilds a stale cache across SQLite lifetimes", () => {
  const directory = mkdtempSync(join(tmpdir(), "tactical-profile-revision-"));
  const progressPath = join(directory, "progress.sqlite");
  const cachePath = join(directory, "profile-cache.sqlite");
  try {
    const initialStore = new SQLiteStore(progressPath);
    initialStore.migrate();
    seedStore(initialStore);
    seedWeaknessHistory(initialStore);
    const initialCacheDb = new DatabaseSync(cachePath);
    const initialRepository = new SQLiteTacticalProfileRepository(
      new NodeSqliteDatabase(initialCacheDb)
    );
    const initialProfile = new TacticalProfileService({
      progressStore: initialStore,
      puzzleSource: initialStore,
      repository: initialRepository,
      calibration: CALIBRATION,
      naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} }
    });
    const initial = initialProfile.getSnapshot("2026-07-25T00:00:00.000Z");
    const consumedRevision = initial.buildState.sourceRevision;
    initialCacheDb.close();
    initialStore.close();

    const changedStore = new SQLiteStore(progressPath);
    changedStore.migrate();
    const completedAt = "2026-07-24T00:04:00.000Z";
    const config = buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20
    });
    const session = startSprint({
      id: "crash-window-session",
      config,
      puzzles: [changedStore.getPuzzle("evidence-0")!],
      ratingBefore: 925,
      now: "2026-07-24T00:00:00.000Z"
    });
    changedStore.transaction(() => {
      changedStore.createSprintSession(session);
      changedStore.recordAttempt(attempt({
        id: "crash-window-attempt",
        sessionId: session.id,
        puzzleId: "evidence-0",
        completedAt
      }));
      changedStore.updateSprintSession({
        ...session,
        status: "failed",
        completedAt,
        endReason: "max_mistakes",
        correctCount: 0,
        mistakeCount: 1,
        ratingAfter: 900
      });
    });
    const changedRevision = changedStore.getTacticalProfileSourceRevision();
    assert.ok(changedRevision > consumedRevision);
    changedStore.close();

    const recoveredStore = new SQLiteStore(progressPath);
    recoveredStore.migrate();
    const recoveredCacheDb = new DatabaseSync(cachePath);
    const recoveredRepository = new SQLiteTacticalProfileRepository(
      new NodeSqliteDatabase(recoveredCacheDb)
    );
    const recoveredProfile = new TacticalProfileService({
      progressStore: recoveredStore,
      puzzleSource: recoveredStore,
      repository: recoveredRepository,
      calibration: CALIBRATION,
      naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} }
    });
    const importedAt = "2026-07-23T00:04:00.000Z";
    const incoming = recoveredStore.exportLocalData();
    incoming.sprintSessions.push({
      id: "post-restart-import-session",
      mode: "standard",
      ratingKey: config.ratingKey,
      startedAt: "2026-07-23T00:00:00.000Z",
      completedAt: importedAt,
      status: "failed",
      correctCount: 0,
      mistakeCount: 1,
      ratingBefore: 925,
      ratingAfter: 900,
      config
    });
    incoming.attempts.push(attempt({
      id: "post-restart-import-attempt",
      sessionId: "post-restart-import-session",
      puzzleId: "evidence-1",
      completedAt: importedAt
    }));
    const imported = new PracticeService(
      recoveredStore,
      recoveredProfile
    ).importLocalData(incoming);
    assert.equal(imported.sprintSessions, 1);
    assert.equal(imported.attempts, 1);
    const recoveredRevision =
      recoveredStore.getTacticalProfileSourceRevision();

    const recovered = recoveredProfile.getSnapshot(
      "2026-07-25T00:00:00.000Z"
    );

    assert.ok(recoveredRevision > changedRevision);
    assert.equal(recovered.buildState.sourceRevision, recoveredRevision);
    const recoveredCells = recoveredRepository.listDailyCells(identity());
    assert.ok(
      recoveredCells.some((cell) =>
        cell.completedDay === "2026-07-24" &&
        cell.distinctSessionIds.includes("crash-window-session")
      )
    );
    assert.ok(
      recoveredCells.some((cell) =>
        cell.completedDay === "2026-07-23" &&
        cell.distinctSessionIds.includes("post-restart-import-session")
      )
    );
    recoveredCacheDb.close();
    recoveredStore.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("chronological, reversed, and duplicate canonical imports converge to identical cells", () => {
  const source = seededStore();
  seedWeaknessHistory(source);
  const exported = source.exportLocalData();
  const variants = [
    exported.attempts,
    [...exported.attempts].reverse(),
    [...exported.attempts, ...exported.attempts].reverse()
  ];
  const serializedCells = variants.map((attempts) => {
    const target = seededStore();
    target.importLocalData({ ...exported, attempts });
    const repository = new MemoryTacticalProfileRepository();
    service(target, repository).getSnapshot("2026-07-25T00:00:00.000Z");
    return JSON.stringify(repository.listDailyCells(identity()));
  });

  assert.equal(new Set(serializedCells).size, 1);
});

test("a no-op canonical import preserves cache identity and recommendation hysteresis", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  const practice = new PracticeService(store, profile);
  const before = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const resetCount = repository.resetCount;
  const markedDayCount = repository.markedDays.length;
  const incoming = store.exportLocalData();
  const listAttempts = store.listAttempts.bind(store);
  const listSprintSessions = store.listSprintSessions.bind(store);
  const listSprintAttemptUtcDays =
    store.listSprintAttemptUtcDays.bind(store);
  let fullSprintAttemptReads = 0;
  let fullSprintSessionReads = 0;
  let sessionDayReads = 0;
  store.listAttempts = (filter) => {
    if (
      filter?.source === "sprint" &&
      filter.sessionId === undefined &&
      filter.since === undefined &&
      filter.until === undefined
    ) {
      fullSprintAttemptReads += 1;
    }
    return listAttempts(filter);
  };
  store.listSprintSessions = () => {
    fullSprintSessionReads += 1;
    return listSprintSessions();
  };
  store.listSprintAttemptUtcDays = (sessionIds) => {
    sessionDayReads += 1;
    return listSprintAttemptUtcDays(sessionIds);
  };

  const imported = practice.importLocalData(incoming);
  const after = profile.getSnapshot("2026-07-26T00:00:00.000Z");

  assert.deepEqual(imported, {
    ratings: 0,
    attempts: 0,
    reviewQueue: 0,
    sprintSessions: 0,
    practiceRuns: 0
  });
  assert.equal(repository.resetCount, resetCount);
  assert.equal(repository.markedDays.length, markedDayCount);
  assert.equal(fullSprintAttemptReads, 0);
  assert.equal(sessionDayReads, 0);
  assert.equal(
    fullSprintSessionReads,
    1,
    "the rating reconciliation may read sessions once, but Profile import tracking must not scan them"
  );
  assert.equal(after.buildState.evaluatedAt, before.buildState.evaluatedAt);
  assert.deepEqual(
    after.buildState.recommendedSignalIds,
    before.buildState.recommendedSignalIds
  );
});

test("a changed canonical import dirties only its affected UTC day", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  const practice = new PracticeService(store, profile);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const resetCount = repository.resetCount;
  const importedDay = "2026-07-24";
  const importedAt = `${importedDay}T00:04:00.000Z`;
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  const incoming = store.exportLocalData();
  incoming.sprintSessions.push({
    id: "imported-mixed-session",
    mode: "standard",
    ratingKey: config.ratingKey,
    startedAt: `${importedDay}T00:00:00.000Z`,
    completedAt: importedAt,
    status: "failed",
    correctCount: 0,
    mistakeCount: 1,
    ratingBefore: 925,
    ratingAfter: 900,
    config
  });
  incoming.attempts.push(attempt({
    id: "imported-mixed-attempt",
    sessionId: "imported-mixed-session",
    puzzleId: "evidence-0",
    completedAt: importedAt
  }));

  const imported = practice.importLocalData(incoming);

  assert.equal(imported.sprintSessions, 1);
  assert.equal(imported.attempts, 1);
  assert.equal(repository.resetCount, resetCount);
  assert.deepEqual(repository.markedDays.slice(-1), [[importedDay]]);
});

test("a changed imported session config dirties every day containing that session", () => {
  const store = seededStore();
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  const session = startSprint({
    id: "multi-day-session",
    config,
    puzzles: [store.getPuzzle("evidence-0")!],
    ratingBefore: 925,
    now: "2026-07-20T00:00:00.000Z"
  });
  const completed = {
    ...session,
    status: "failed" as const,
    completedAt: "2026-07-21T00:04:00.000Z",
    endReason: "max_mistakes" as const,
    correctCount: 0,
    mistakeCount: 2,
    ratingAfter: 900
  };
  store.createSprintSession(completed);
  for (const [index, day] of ["2026-07-20", "2026-07-21"].entries()) {
    store.recordAttempt(attempt({
      id: `multi-day-attempt-${index}`,
      sessionId: session.id,
      puzzleId: "evidence-0",
      completedAt: `${day}T00:04:00.000Z`
    }));
  }
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  const practice = new PracticeService(store, profile);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");

  const incoming = store.exportLocalData();
  incoming.sprintSessions = incoming.sprintSessions.map((candidate) =>
    candidate.id === session.id
      ? {
          ...candidate,
          completedAt: "2026-07-22T00:04:00.000Z",
          config: { ...config, themes: ["fork"] }
        }
      : candidate
  );
  practice.importLocalData(incoming);

  assert.deepEqual(
    repository.markedDays.slice(-1),
    [["2026-07-20", "2026-07-21"]]
  );
});

test("an attempt-first split import converges when its session arrives later", () => {
  const store = seededStore();
  const repository = new MemoryTacticalProfileRepository();
  const profile = service(store, repository);
  const practice = new PracticeService(store, profile);
  profile.getSnapshot("2026-07-19T00:00:00.000Z");
  const completedAt = "2026-07-20T00:04:00.000Z";
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  const attemptOnly = store.exportLocalData();
  attemptOnly.attempts.push(attempt({
    id: "attempt-before-session",
    sessionId: "late-session",
    puzzleId: "evidence-0",
    completedAt
  }));

  practice.importLocalData(attemptOnly);
  profile.getSnapshot("2026-07-20T01:00:00.000Z");
  assert.equal(repository.listDailyCells(identity()).length, 0);

  const sessionOnly = store.exportLocalData();
  sessionOnly.attempts = [];
  sessionOnly.sprintSessions.push({
    id: "late-session",
    mode: "standard",
    ratingKey: config.ratingKey,
    startedAt: "2026-07-20T00:00:00.000Z",
    completedAt,
    status: "failed",
    correctCount: 0,
    mistakeCount: 1,
    ratingBefore: 925,
    ratingAfter: 900,
    config
  });

  practice.importLocalData(sessionOnly);
  profile.getSnapshot("2026-07-20T02:00:00.000Z");

  assert.equal(repository.listDailyCells(identity()).length, 1);
});

test("a model or pack identity change rebuilds the derived cache from canonical history", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new MemoryTacticalProfileRepository();
  const firstProfile = service(store, repository);
  firstProfile.getSnapshot("2026-07-25T00:00:00.000Z");
  const firstCells = repository.listDailyCells(identity());
  const recalibrated: TacticalProfileCalibrationArtifact = {
    ...CALIBRATION,
    modelVersion: "test-v2",
    calibrationId: "test-calibration-v2",
    packFeatureHash: "test-pack-rd-v2"
  };
  const secondProfile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository,
    calibration: recalibrated,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} }
  });

  const rebuilt = secondProfile.getSnapshot("2026-07-25T00:00:00.000Z");
  const rebuiltCells = repository.listDailyCells({
    modelVersion: recalibrated.modelVersion,
    packFeatureHash: recalibrated.packFeatureHash,
    calibrationId: recalibrated.calibrationId
  });

  assert.equal(rebuilt.phase, "ready");
  assert.deepEqual(
    rebuiltCells.map(withoutCacheIdentity),
    firstCells.map(withoutCacheIdentity)
  );
});

test("TacticalProfileService preserves 10 / 5 quotas, exact deduplication, and an unrated fixed Run", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());

  const result = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "focus-seed"
  );

  assert.equal(result.status, "ready", JSON.stringify(result));
  if (result.status !== "ready") {
    return;
  }
  assert.deepEqual(
    result.prepared.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 10]]
  );
  assert.equal(result.prepared.plan.mixedControlCount, 5);
  assert.equal(result.prepared.puzzles.length, 15);
  assert.equal(new Set(result.prepared.puzzles.map((puzzle) => puzzle.id)).size, 15);
  assert.equal(
    result.prepared.puzzles.filter((puzzle) => puzzle.themes.includes("fork")).length,
    10
  );
  assert.equal(result.prepared.config.maxAttempts, 15);
  assert.equal(result.prepared.config.ratingPolicy, "unrated");
  assert.equal(result.prepared.config.tacticalFocus?.mixedControlCount, 5);
  assert.equal(result.prepared.config.ratingKey, "standard 5/20");
  assert.deepEqual(
    result.prepared.puzzles.map((puzzle) =>
      puzzle.themes.includes("fork") ? "focus" : "mixed"
    ),
    [
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed"
    ]
  );
});

test("TacticalProfileService backfills a sparse theme only with mixed control", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  for (let index = 0; index < 8; index += 1) {
    store.recordAttempt({
      ...attempt({
        id: `recent-review-${index}`,
        sessionId: `review-session-${index}`,
        puzzleId: `fresh-fork-${index}`,
        completedAt: "2026-07-24T00:00:00.000Z"
      }),
      source: "scheduled_review"
    });
  }
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: CALIBRATION,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200],
      themeShortfallBackfill: {
        destination: "mixed_control",
        minimumPuzzlesPerTheme: 1
      }
    }
  });

  const result = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "sparse-backfill"
  );

  assert.equal(result.status, "ready", JSON.stringify(result));
  if (result.status !== "ready") return;
  assert.deepEqual(
    result.prepared.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 4]]
  );
  assert.equal(result.prepared.plan.mixedControlCount, 11);
  assert.equal(
    result.prepared.puzzles.filter((puzzle) => puzzle.themes.includes("fork")).length,
    4
  );
  assert.equal(result.prepared.puzzles.length, 15);
});

test("overlapping focus inventory widens before giving up on an exact two-theme Run", () => {
  const store = new MemoryStore();
  const evidence = Array.from({ length: 12 }, (_, index) =>
    puzzle(`dual-evidence-${index}`, ["fork", "pin"])
  );
  const narrowOverlap = Array.from({ length: 9 }, (_, index) =>
    puzzle(`narrow-overlap-${index}`, ["fork", "pin"])
  );
  const widerForks = Array.from({ length: 9 }, (_, index) =>
    puzzle(`wider-fork-${index}`, ["fork"], 1_100)
  );
  const widerPins = Array.from({ length: 3 }, (_, index) =>
    puzzle(`wider-pin-${index}`, ["pin"], 1_100)
  );
  const mixed = Array.from({ length: 3 }, (_, index) =>
    puzzle(`dual-mixed-${index}`, ["sacrifice"])
  );
  store.seedPuzzles([
    ...evidence,
    ...narrowOverlap,
    ...widerForks,
    ...widerPins,
    ...mixed
  ]);
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 925,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });
  seedDualWeaknessHistory(store);
  const originalSelectRatingBands =
    store.selectPuzzlesForRatingBands.bind(store);
  let selectionQueries = 0;
  store.selectPuzzlesForRatingBands = (input) => {
    selectionQueries += 1;
    return originalSelectRatingBands(input);
  };
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: CALIBRATION,
    naturalFrequency: {
      line: { fork: 0.12, pin: 0.12 },
      arrow_duel: {}
    },
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    }
  });

  const result = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "overlap-widening"
  );

  assert.equal(result.status, "ready", JSON.stringify(result));
  if (result.status !== "ready") return;
  assert.equal(result.prepared.plan.minRating, 725);
  assert.equal(result.prepared.plan.maxRating, 1_125);
  assert.deepEqual(
    result.prepared.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 9], ["pin", 3]]
  );
  assert.equal(result.prepared.plan.mixedControlCount, 3);
  assert.equal(new Set(result.prepared.puzzles.map((puzzle) => puzzle.id)).size, 15);
  assert.equal(
    selectionQueries,
    3,
    "nested rating widening should select primary, secondary, and mixed once"
  );
});

test("overlap shortfalls backfill only to mixed control at the final rating band", () => {
  const store = new MemoryStore();
  store.seedPuzzles([
    ...Array.from({ length: 12 }, (_, index) =>
      puzzle(`dual-evidence-${index}`, ["fork", "pin"])
    ),
    ...Array.from({ length: 9 }, (_, index) =>
      puzzle(`final-overlap-${index}`, ["fork", "pin"])
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      puzzle(`final-mixed-${index}`, ["sacrifice"])
    )
  ]);
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 925,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });
  seedDualWeaknessHistory(store);
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: CALIBRATION,
    naturalFrequency: {
      line: { fork: 0.12, pin: 0.12 },
      arrow_duel: {}
    },
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100],
      themeShortfallBackfill: {
        destination: "mixed_control",
        minimumPuzzlesPerTheme: 1
      }
    }
  });

  const result = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "overlap-backfill"
  );

  assert.equal(result.status, "ready", JSON.stringify(result));
  if (result.status !== "ready") return;
  assert.deepEqual(
    result.prepared.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 8], ["pin", 1]]
  );
  assert.equal(result.prepared.plan.mixedControlCount, 6);
  assert.equal(new Set(result.prepared.puzzles.map((puzzle) => puzzle.id)).size, 15);
});

test("a new Focused Run uses the current family Rating without rewriting old evidence", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new MemoryTacticalProfileRepository();
  const profile = service(store, repository);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const oldEvidence = repository.listDailyCells(identity());
  const current = store.getRating("standard 5/20");
  store.saveRating({ ...current, generation: current.generation + 1, rating: 1000 });

  const prepared = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "rating-growth"
  );

  assert.equal(prepared.status, "ready", JSON.stringify(prepared));
  if (prepared.status !== "ready") {
    return;
  }
  assert.equal(prepared.prepared.plan.ratingAnchor.rating, 1000);
  assert.equal(prepared.prepared.plan.minRating, 900);
  assert.equal(prepared.prepared.plan.maxRating, 1100);
  assert.deepEqual(repository.listDailyCells(identity()), oldEvidence);
});

test("Rating growth re-evaluates opportunity frequency without rewriting evidence", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new MemoryTacticalProfileRepository();
  const observedRatings: number[] = [];
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository,
    calibration: CALIBRATION,
    naturalFrequency: { line: { fork: 0.01 }, arrow_duel: {} },
    naturalFrequencyForRating: (taskFamily, rating) => {
      observedRatings.push(rating);
      return taskFamily === "line"
        ? { fork: rating < 1_000 ? 0.01 : 0.25 }
        : {};
    }
  });

  const before = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const oldEvidence = repository.listDailyCells(identity());
  const beforeFork = before.evaluation.signals.find(
    (signal) => signal.id === "line:fork"
  );
  const current = store.getRating("standard 5/20");
  store.saveRating({
    ...current,
    generation: current.generation + 1,
    rating: 1_025
  });

  const after = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const afterFork = after.evaluation.signals.find(
    (signal) => signal.id === "line:fork"
  );

  assert.deepEqual(observedRatings, [925, 1_025]);
  assert.equal(afterFork?.solveConfidence, beforeFork?.solveConfidence);
  assert.ok(
    (afterFork?.actionPriority ?? 0) > (beforeFork?.actionPriority ?? 0)
  );
  assert.deepEqual(repository.listDailyCells(identity()), oldEvidence);
});

test("manifest inventory preflight skips exact queries for an impossible theme", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const originalSelectPuzzles = store.selectPuzzles.bind(store);
  let exactQueries = 0;
  store.selectPuzzles = (filter) => {
    exactQueries += 1;
    return originalSelectPuzzles(filter);
  };
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: CALIBRATION,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    inventoryUpperBound: () => ({ fork: 0 }),
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    }
  });

  assert.deepEqual(
    profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z"),
    { status: "unavailable", reason: "insufficient_inventory" }
  );
  assert.equal(exactQueries, 0);
});

test("TacticalProfileService does not re-offer a Focused Run before fresh mixed evidence", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const prepared = profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z");
  assert.equal(prepared.status, "ready", JSON.stringify(prepared));
  if (prepared.status !== "ready") {
    return;
  }
  const focused = startSprint({
    id: "focused-session",
    config: prepared.prepared.config,
    puzzles: [...prepared.prepared.puzzles],
    ratingBefore: 925,
    now: "2026-07-24T00:00:00.000Z"
  });
  store.createSprintSession({
    ...focused,
    status: "won",
    completedAt: "2026-07-24T00:05:00.000Z",
    endReason: "attempt_limit",
    correctCount: 12,
    mistakeCount: 3
  });

  assert.deepEqual(
    profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z"),
    { status: "unavailable", reason: "no_fresh_evidence" }
  );

  const abandonedWithoutEvidence = startSprint({
    id: "abandoned-without-evidence",
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20
    }),
    puzzles: [store.getPuzzle("mixed-0")!],
    ratingBefore: 925,
    now: "2026-07-24T00:30:00.000Z"
  });
  store.createSprintSession({
    ...abandonedWithoutEvidence,
    status: "abandoned",
    completedAt: "2026-07-24T00:31:00.000Z",
    endReason: "abandoned"
  });

  assert.deepEqual(
    profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z"),
    { status: "unavailable", reason: "no_fresh_evidence" }
  );
});

test("PracticeService starts the prepared Focused Run through the normal session boundary", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const practice = new PracticeService(store, profile);

  const started = practice.startFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "focus-seed"
  );

  assert.equal(started.status, "active");
  assert.equal(started.puzzles.length, 15);
  assert.equal(started.config.ratingPolicy, "unrated");
  assert.equal(started.config.tacticalFocus?.taskFamily, "line");
  assert.equal(
    practice.listSprintSessions().find((session) => session.id === started.id)?.config?.maxAttempts,
    15
  );
});

test("an active Focused Run keeps its frozen puzzle IDs, Rating band, and quotas", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const practice = new PracticeService(store, profile);
  const started = practice.startFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "frozen-run"
  );
  const frozen = {
    puzzleIds: started.puzzles.map((puzzle) => puzzle.id),
    tacticalFocus: structuredClone(started.config.tacticalFocus),
    maxAttempts: started.config.maxAttempts
  };
  const rating = store.getRating(started.config.ratingKey);
  store.saveRating({
    ...rating,
    generation: rating.generation + 1,
    rating: rating.rating + 300
  });

  const active = practice.getActiveSprint();

  assert.deepEqual(active?.puzzles.map((puzzle) => puzzle.id), frozen.puzzleIds);
  assert.deepEqual(active?.config.tacticalFocus, frozen.tacticalFocus);
  assert.equal(active?.config.maxAttempts, frozen.maxAttempts);
  assert.throws(
    () => practice.startFocusedRun(
      "line",
      "2026-07-25T00:01:00.000Z",
      "replacement-run"
    ),
    /while another sprint is active/
  );
});

for (const storeKind of ["memory", "sqlite"] as const) {
  test(`${storeKind} source revisions ignore interventions and zero-attempt Runs`, () => {
    const store = storeKind === "memory"
      ? new MemoryStore()
      : new SQLiteStore();
    try {
      if (store instanceof SQLiteStore) {
        store.migrate();
      }
      store.seedPuzzles([puzzle("revision-puzzle", ["fork"])]);
      store.saveRating({
        key: "standard 5/20",
        generation: 0,
        rating: 925,
        ratingDeviation: 80,
        volatility: 0.06,
        games: 0
      });
      const before = store.getTacticalProfileSourceRevision();
      const focusedConfig = buildSprintConfig({
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        maxAttempts: 15,
        ratingPolicy: "unrated",
        tacticalFocus: {
          taskFamily: "line",
          themes: ["fork"],
          mixedControlCount: 5,
          ratingAnchor: 925,
          minRating: 825,
          maxRating: 1_025
        }
      });
      const focused = startSprint({
        id: `${storeKind}-focused-revision`,
        config: focusedConfig,
        puzzles: [store.getPuzzle("revision-puzzle")!],
        ratingBefore: 925,
        now: "2026-07-25T01:00:00.000Z"
      });
      store.transaction(() => {
        store.createSprintSession(focused);
        store.recordAttempt(attempt({
          id: `${storeKind}-focused-attempt`,
          sessionId: focused.id,
          puzzleId: "revision-puzzle",
          completedAt: "2026-07-25T01:00:10.000Z"
        }));
        store.updateSprintSession({
          ...focused,
          status: "won",
          completedAt: "2026-07-25T01:00:10.000Z",
          endReason: "attempt_limit",
          correctCount: 1,
          mistakeCount: 0
        });
      });
      assert.equal(store.getTacticalProfileSourceRevision(), before);
      store.clearLocalHistory();
      assert.equal(
        store.getTacticalProfileSourceRevision(),
        before,
        "clearing intervention-only history must not invalidate the profile"
      );

      const ordinaryConfig = buildSprintConfig({
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20
      });
      const zeroAttempt = startSprint({
        id: `${storeKind}-zero-attempt-revision`,
        config: ordinaryConfig,
        puzzles: [store.getPuzzle("revision-puzzle")!],
        ratingBefore: 925,
        now: "2026-07-25T02:00:00.000Z"
      });
      store.createSprintSession(zeroAttempt);
      store.updateSprintSession({
        ...zeroAttempt,
        status: "abandoned",
        completedAt: "2026-07-25T02:00:01.000Z",
        endReason: "abandoned"
      });
      assert.equal(store.getTacticalProfileSourceRevision(), before);
      store.clearLocalHistory();
      assert.equal(
        store.getTacticalProfileSourceRevision(),
        before,
        "clearing zero-attempt history must not invalidate the profile"
      );

      const ordinary = startSprint({
        id: `${storeKind}-ordinary-revision`,
        config: ordinaryConfig,
        puzzles: [store.getPuzzle("revision-puzzle")!],
        ratingBefore: 925,
        now: "2026-07-25T03:00:00.000Z"
      });
      store.transaction(() => {
        store.createSprintSession(ordinary);
        store.recordAttempt(attempt({
          id: `${storeKind}-ordinary-attempt`,
          sessionId: ordinary.id,
          puzzleId: "revision-puzzle",
          completedAt: "2026-07-25T03:00:10.000Z"
        }));
        store.updateSprintSession({
          ...ordinary,
          status: "failed",
          completedAt: "2026-07-25T03:00:10.000Z",
          endReason: "max_mistakes",
          correctCount: 0,
          mistakeCount: 1
        });
      });
      assert.equal(store.getTacticalProfileSourceRevision(), before + 1);
      store.clearLocalHistory();
      assert.equal(
        store.getTacticalProfileSourceRevision(),
        before + 2,
        "clearing canonical ordinary-mixed evidence must invalidate the profile"
      );
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

test("derived-cache write failures do not undo canonical Sprint or import progress", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const practice = new PracticeService(store, profile);
  store.seedPuzzles([playablePuzzle("cache-failure-run")]);
  practice.setPuzzleSelectionScopeIds(["cache-failure-run"]);

  repository.failNext("markDirtyDays");
  const started = practice.startSprint({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    targetCorrect: 1,
    maxMistakes: 1
  }, "2026-07-25T01:00:00.000Z");
  const completed = practice.advanceSprintTime("2026-07-25T01:01:01.000Z");

  assert.equal(completed.state.status, "failed");
  assert.ok(store.listAttempts({ sessionId: started.id }).length > 0);
  assert.equal(
    store.listSprintSessions().find((session) => session.id === started.id)?.status,
    "failed"
  );

  repository.failNext("reset");
  const imported = practice.importLocalData(store.exportLocalData());
  assert.ok(imported.attempts >= 0);
  assert.doesNotThrow(() =>
    practice.getTacticalProfileSnapshot("2026-07-25T02:00:00.000Z")
  );
});

test("a recoverable cache read failure returns a fail-closed snapshot and rebuilds later", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");
  repository.failNext("listDirtyDays");

  const unavailable = profile.getSnapshot("2026-07-25T01:00:00.000Z");
  const recovered = profile.getSnapshot("2026-07-25T02:00:00.000Z");

  assert.equal(unavailable.phase, "building");
  assert.equal(unavailable.buildState.status, "failed");
  assert.match(unavailable.buildState.lastError ?? "", /simulated listDirtyDays failure/);
  assert.equal(unavailable.evaluation.signals.length, 0);
  assert.equal(recovered.phase, "ready");
  assert.equal(recovered.buildState.status, "ready");
});

test("a persistent malformed build state is reset before the next recovery read", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new RecoveringTacticalProfileRepository();
  const profile = service(store, repository);
  profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const resetCount = repository.resetCount;
  repository.failBuildStateReadsUntilReset();

  const unavailable = profile.getSnapshot("2026-07-25T01:00:00.000Z");
  const recovered = profile.getSnapshot("2026-07-25T02:00:00.000Z");

  assert.equal(unavailable.phase, "building");
  assert.equal(unavailable.buildState.status, "failed");
  assert.match(
    unavailable.buildState.lastError ?? "",
    /simulated persistent getBuildState failure/
  );
  assert.equal(repository.resetCount, resetCount + 1);
  assert.equal(recovered.phase, "ready");
  assert.equal(recovered.buildState.status, "ready");
});

test("an uncalibrated task family remains collecting without scanning it into recommendations", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const uncalibrated: TacticalProfileCalibrationArtifact = {
    ...CALIBRATION,
    provenance: {
      ...CALIBRATION.provenance,
      representativeOwnerApproved: false,
      corpusHash: null,
      reportHash: null,
      decisionEvidenceId: null,
      familyReadiness: {
        line: {
          ready: false,
          reasons: ["Holdout sample is not representative"]
        },
        arrow_duel: {
          ready: false,
          reasons: ["Holdout sample is not representative"]
        }
      }
    },
    families: {
      line: { status: "unavailable", reason: "Holdout sample is not representative" },
      arrow_duel: { status: "unavailable", reason: "Holdout sample is not representative" }
    }
  };
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: uncalibrated,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} }
  });

  const snapshot = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(snapshot.phase, "collecting");
  assert.equal(snapshot.evaluation.signals.length, 0);
  assert.match(snapshot.unavailableFamilies.line ?? "", /not representative/);
});

function service(
  store: MemoryStore,
  repository: MemoryTacticalProfileRepository
): TacticalProfileService {
  return new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository,
    calibration: CALIBRATION,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    }
  });
}

function seededStore(): MemoryStore {
  const store = new MemoryStore();
  seedStore(store);
  return store;
}

function seedStore(store: MemoryStore | SQLiteStore): void {
  const evidence = Array.from({ length: 12 }, (_, index) =>
    puzzle(`evidence-${index}`, ["fork"])
  );
  const freshForks = Array.from({ length: 12 }, (_, index) =>
    puzzle(`fresh-fork-${index}`, ["fork"])
  );
  const mixed = Array.from({ length: 12 }, (_, index) =>
    puzzle(`mixed-${index}`, ["sacrifice"])
  );
  store.seedPuzzles([...evidence, ...freshForks, ...mixed]);
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 925,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });
}

function seedWeaknessHistory(store: MemoryStore | SQLiteStore): void {
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const day = 10 + sessionIndex * 4;
    const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
    const session = startSprint({
      id: `mixed-session-${sessionIndex}`,
      config,
      puzzles: [store.getPuzzle(`evidence-${sessionIndex * 4}`)!],
      ratingBefore: 925,
      now: startedAt
    });
    store.transaction(() => {
      store.createSprintSession(session);
      for (let offset = 0; offset < 4; offset += 1) {
        const index = sessionIndex * 4 + offset;
        store.recordAttempt(attempt({
          id: `attempt-${index}`,
          sessionId: session.id,
          puzzleId: `evidence-${index}`,
          completedAt
        }));
      }
      store.updateSprintSession({
        ...session,
        status: "failed",
        completedAt,
        endReason: "max_mistakes",
        correctCount: 0,
        mistakeCount: 4,
        ratingAfter: 900
      });
    });
  }
}

function seedDualWeaknessHistory(store: MemoryStore): void {
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const day = 10 + sessionIndex * 4;
    const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
    const session = startSprint({
      id: `dual-session-${sessionIndex}`,
      config,
      puzzles: [store.getPuzzle(`dual-evidence-${sessionIndex * 4}`)!],
      ratingBefore: 925,
      now: startedAt
    });
    store.transaction(() => {
      store.createSprintSession(session);
      for (let offset = 0; offset < 4; offset += 1) {
        const index = sessionIndex * 4 + offset;
        store.recordAttempt(attempt({
          id: `dual-attempt-${index}`,
          sessionId: session.id,
          puzzleId: `dual-evidence-${index}`,
          completedAt
        }));
      }
      store.updateSprintSession({
        ...session,
        status: "failed",
        completedAt,
        endReason: "max_mistakes",
        correctCount: 0,
        mistakeCount: 4,
        ratingAfter: 900
      });
    });
  }
}

function attempt(input: {
  id: string;
  sessionId: string;
  puzzleId: string;
  completedAt: string;
}): AttemptEvent {
  return {
    id: input.id,
    source: "sprint",
    sessionId: input.sessionId,
    puzzleId: input.puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "wrong",
    submittedMove: "e6d6",
    expectedMove: "e6e7",
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    elapsedMs: 10_000,
    ratingBefore: 925
  };
}

function puzzle(id: string, themes: string[], rating = 925): Puzzle {
  return {
    id,
    initialFen: "8/8/4P3/8/8/8/8/4K2k w - - 0 1",
    solutionMoves: ["e6e7"],
    rating,
    ratingDeviation: 80,
    themes,
    source: "lichess",
    stockfishBestMove: id
  };
}

function playablePuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
    solutionMoves: ["e8f7", "e2e6", "f7f8", "e6f7"],
    rating: 925,
    ratingDeviation: 80,
    themes: ["mate", "mateIn2", "middlegame", "short"],
    source: "lichess",
    stockfishBestMove: "e2e6"
  };
}

function identity() {
  return {
    modelVersion: CALIBRATION.modelVersion,
    packFeatureHash: CALIBRATION.packFeatureHash,
    calibrationId: CALIBRATION.calibrationId
  };
}

function withoutCacheIdentity(
  cell: ReturnType<MemoryTacticalProfileRepository["listDailyCells"]>[number]
) {
  const {
    modelVersion: _modelVersion,
    packFeatureHash: _packFeatureHash,
    calibrationId: _calibrationId,
    ...evidence
  } = cell;
  return evidence;
}

class RecoveringTacticalProfileRepository extends MemoryTacticalProfileRepository {
  private nextFailure: "listDirtyDays" | "markDirtyDays" | "reset" | undefined;
  private persistentBuildStateFailure = false;
  readonly markedDays: string[][] = [];
  resetCount = 0;

  failNext(operation: NonNullable<RecoveringTacticalProfileRepository["nextFailure"]>): void {
    this.nextFailure = operation;
  }

  failBuildStateReadsUntilReset(): void {
    this.persistentBuildStateFailure = true;
  }

  override getBuildState(
    ...args: Parameters<MemoryTacticalProfileRepository["getBuildState"]>
  ): ReturnType<MemoryTacticalProfileRepository["getBuildState"]> {
    if (this.persistentBuildStateFailure) {
      throw new Error("simulated persistent getBuildState failure");
    }
    return super.getBuildState(...args);
  }

  override listDirtyDays(
    ...args: Parameters<MemoryTacticalProfileRepository["listDirtyDays"]>
  ): string[] {
    this.maybeFail("listDirtyDays");
    return super.listDirtyDays(...args);
  }

  override markDirtyDays(
    ...args: Parameters<MemoryTacticalProfileRepository["markDirtyDays"]>
  ): void {
    this.maybeFail("markDirtyDays");
    this.markedDays.push([...args[1]]);
    super.markDirtyDays(...args);
  }

  override reset(
    ...args: Parameters<MemoryTacticalProfileRepository["reset"]>
  ): void {
    this.maybeFail("reset");
    this.resetCount += 1;
    super.reset(...args);
    this.persistentBuildStateFailure = false;
  }

  private maybeFail(
    operation: NonNullable<RecoveringTacticalProfileRepository["nextFailure"]>
  ): void {
    if (this.nextFailure !== operation) {
      return;
    }
    this.nextFailure = undefined;
    throw new Error(`simulated ${operation} failure`);
  }
}

const CALIBRATION = {
  schemaVersion: 1,
  modelVersion: "test-v1",
  calibrationId: "test-calibration",
  packFeatureHash: "test-pack-rd",
  createdAt: "2026-07-01T00:00:00.000Z",
  provenance: {
    inputSchemaVersion: 1,
    policyId: "test-policy",
    policyHash: `sha256:${"1".repeat(64)}`,
    corpusHash: `sha256:${"2".repeat(64)}`,
    reportHash: `sha256:${"3".repeat(64)}`,
    decisionEvidenceId: "test-decisions",
    representativeOwnerApproved: true,
    familyReadiness: {
      line: { ready: true, reasons: [] },
      arrow_duel: { ready: true, reasons: [] }
    }
  },
  recencyHalfLifeDays: 90,
  evidence: {
    watchProbability: 0.75,
    recommendationExitProbability: 0.85,
    recommendationProbability: 0.9,
    strongProbability: 0.97,
    minDistinctPuzzles: 4,
    minDistinctSessions: 2
  },
  opportunity: {
    minimumWeight: 0.25,
    exponent: 0.5
  },
  families: {
    line: calibratedFamily(),
    arrow_duel: calibratedFamily()
  }
} as const satisfies TacticalProfileCalibrationArtifact;

function calibratedFamily() {
  return {
    status: "calibrated",
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 200,
      practicalDeficitRating: 20,
      minExpectedFailuresPer100: 2
    },
    speed: {
      interceptLogSeconds: Math.log(30),
      relativeDifficultyCoefficient: 0,
      decisionCountCoefficient: 0,
      paceLogCoefficient: 0,
      slowPolicyLogCoefficient: 0,
      residualSd: 0.25,
      themePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  } as const;
}
