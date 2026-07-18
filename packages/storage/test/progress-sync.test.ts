import test from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "UTC";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MemoryStore,
  PackBackedPracticeStore,
  PracticeService,
  ProgressSyncConflictError,
  SQLiteStore,
  mergeLocalDataExports,
  syncPracticeProgress
} from "../src/index.ts";
import type { ProgressSyncSnapshot, ProgressSyncTransport } from "../src/index.ts";
import type { LocalDataImport } from "../src/index.ts";
import { defaultSprintConfig } from "../../core/src/index.ts";
import type { Puzzle, SprintState } from "../../core/src/index.ts";

test("syncPracticeProgress does not touch transport while iCloud sync is disabled", async () => {
  const store = await seededMemoryStore();
  const service = new PracticeService(store);
  disableSync(service);
  const transport = new RecordingTransport();

  const result = await syncPracticeProgress(store, transport, {
    deviceId: "device-a",
    now: () => "2026-07-07T00:00:00.000Z"
  });

  assert.deepEqual(result, {
    status: "disabled",
    imported: {
      ratings: 0,
      attempts: 0,
      reviewQueue: 0,
      sprintSessions: 0
    },
    pushed: false
  });
  assert.equal(transport.fetchCount, 0);
  assert.equal(transport.saved.length, 0);
});

test("syncPracticeProgress uploads the current local progress snapshot when enabled", async () => {
  const store = await seededMemoryStore();
  const service = new PracticeService(store);
  enableSync(service);
  recordWrongStandardAttempt(service);
  const transport = new RecordingTransport();

  const result = await syncPracticeProgress(store, transport, {
    deviceId: "device-a",
    now: () => "2026-07-07T00:00:00.000Z"
  });

  assert.equal(result.status, "synced");
  assert.equal(result.pushed, true);
  assert.equal(transport.fetchCount, 1);
  assert.equal(transport.saved.length, 1);
  assert.equal(transport.saved[0]?.deviceId, "device-a");
  assert.equal(transport.saved[0]?.data.settings.sync.iCloudEnabled, true);
  assert.equal(transport.saved[0]?.data.attempts.length, 1);
  assert.equal(transport.saved[0]?.data.reviewQueue.length, 1);
  assert.equal(transport.saved[0]?.data.ratings[0]?.games, 1);
});

test("new sprint sessions capture the active rating generation for sync", async () => {
  const store = await seededMemoryStore();
  store.saveRating({
    key: "standard 5/20",
    generation: 2,
    rating: 700,
    ratingDeviation: 120,
    volatility: 0.06,
    games: 0
  });
  const service = new PracticeService(store);

  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-07-01T00:00:00.000Z"
  );

  assert.equal(service.exportLocalData().sprintSessions[0]?.ratingGeneration, 2);
});

test("syncPracticeProgress imports another device snapshot before uploading the merged snapshot", async () => {
  const remoteStore = await seededMemoryStore();
  const remoteService = new PracticeService(remoteStore);
  enableSync(remoteService);
  recordWrongStandardAttempt(remoteService);
  const remoteSnapshot: ProgressSyncSnapshot = {
    schemaVersion: 1,
    deviceId: "device-b",
    updatedAt: "2026-07-06T00:00:00.000Z",
    data: remoteService.exportLocalData()
  };

  const localStore = await seededMemoryStore();
  const localService = new PracticeService(localStore);
  enableSync(localService);
  const transport = new RecordingTransport(remoteSnapshot);

  const result = await syncPracticeProgress(localStore, transport, {
    deviceId: "device-a",
    now: () => "2026-07-07T00:00:00.000Z"
  });

  assert.equal(result.status, "synced");
  assert.equal(result.remoteUpdatedAt, "2026-07-06T00:00:00.000Z");
  assert.equal(result.imported.attempts, 1);
  assert.equal(result.imported.ratings, 1);
  assert.equal(result.imported.reviewQueue, 1);
  assert.equal(result.imported.sprintSessions, 1);
  assert.equal((localService.listHistory() as unknown[]).length, 1);
  assert.equal(localService.getRating("standard 5/20").games, 1);
  assert.equal(localService.listReviewQueue().length, 1);
  assert.equal(transport.saved.length, 1);
  assert.equal(transport.saved[0]?.data.attempts.length, 1);
  assert.equal(transport.saved[0]?.data.sprintSessions.length, 1);
  assert.equal(transport.saved[0]?.data.settings.sync.iCloudEnabled, true);
});

test("mergeLocalDataExports upgrades legacy timestamp-based review queue entries", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  const remoteService = new PracticeService(await seededMemoryStore());
  recordWrongStandardAttempt(remoteService);
  const remote = remoteService.exportLocalData();
  const { dueDay: _dueDay, intervalDays: _intervalDays, ...legacyReview } = remote.reviewQueue[0]!;
  const legacyRemote: LocalDataImport = {
    ...remote,
    reviewQueue: [legacyReview]
  };

  const merged = mergeLocalDataExports(localService.exportLocalData(), legacyRemote);

  assert.equal(merged.reviewQueue[0]?.dueDay, "2026-06-20");
  assert.equal(merged.reviewQueue[0]?.intervalDays, 1);
  assert.equal(merged.reviewQueue[0]?.dueAt, "2026-06-20T04:00:00.000Z");
  assert.equal(merged.reviewQueue[0]?.intervalHours, 24);
});

test("review sync resolves conflicts by last review time and then due day", async () => {
  const service = new PracticeService(await seededMemoryStore());
  recordWrongStandardAttempt(service);
  const local = service.exportLocalData();
  const base = local.reviewQueue[0]!;
  local.reviewQueue = [{ ...base, dueDay: "2026-07-10", lastReviewedAt: "2026-07-01T12:00:00.000Z" }];
  const newerRemote: LocalDataImport = {
    ...structuredClone(local),
    reviewQueue: [{ ...base, dueDay: "2026-07-05", lastReviewedAt: "2026-07-02T12:00:00.000Z" }]
  };
  const sameTimeRemote: LocalDataImport = {
    ...structuredClone(local),
    reviewQueue: [{ ...base, dueDay: "2026-07-12", lastReviewedAt: "2026-07-01T12:00:00.000Z" }]
  };

  assert.equal(mergeLocalDataExports(local, newerRemote).reviewQueue[0]?.dueDay, "2026-07-05");
  assert.equal(mergeLocalDataExports(local, sameTimeRemote).reviewQueue[0]?.dueDay, "2026-07-12");
});

test("attempt clarity sync uses the latest action and favors clearing exact timestamp ties", async () => {
  const service = new PracticeService(await seededMemoryStore());
  const local = service.exportLocalData();
  const baseAttempt = {
    id: "shared-correct-attempt",
    source: "sprint" as const,
    sessionId: "shared-session",
    puzzleId: "00008",
    mode: "standard" as const,
    ratingKey: "standard 5/20",
    result: "correct" as const,
    submittedMove: "e6e7",
    expectedMove: "e6e7",
    startedAt: "2026-07-17T11:59:55.000Z",
    completedAt: "2026-07-17T12:00:00.000Z",
    ratingBefore: 600
  };
  local.attempts = [{
    ...baseAttempt,
    unclear: true,
    unclearUpdatedAt: "2026-07-17T12:01:00.000Z"
  }];

  const newerClear = structuredClone(local);
  newerClear.attempts = [{
    ...baseAttempt,
    unclear: false,
    unclearUpdatedAt: "2026-07-17T12:02:00.000Z"
  }];
  assert.deepEqual(mergeLocalDataExports(local, newerClear).attempts[0], newerClear.attempts[0]);

  const tiedClear = structuredClone(local);
  tiedClear.attempts = [{
    ...baseAttempt,
    unclear: false,
    unclearUpdatedAt: "2026-07-17T12:01:00.000Z"
  }];
  assert.deepEqual(mergeLocalDataExports(local, tiedClear).attempts[0], tiedClear.attempts[0]);

  const laterMark = structuredClone(tiedClear);
  laterMark.attempts = [{
    ...baseAttempt,
    unclear: true,
    unclearUpdatedAt: "2026-07-17T12:03:00.000Z"
  }];
  assert.deepEqual(mergeLocalDataExports(tiedClear, laterMark).attempts[0], laterMark.attempts[0]);
});

test("pack-backed SQLite sync makes remote progress readable when referenced puzzles only exist in the bundled pack", async () => {
  const bundledPuzzleStore = await seededMemoryStore();
  const remoteService = new PracticeService(bundledPuzzleStore);
  enableSync(remoteService);
  recordWrongStandardAttempt(remoteService);
  const remoteSession = remoteService.listSprintSessions()[0];
  const remoteSnapshot: ProgressSyncSnapshot = {
    schemaVersion: 1,
    deviceId: "iphone",
    updatedAt: "2026-07-06T00:00:00.000Z",
    data: remoteService.exportLocalData()
  };

  const localUserStore = new SQLiteStore(":memory:");
  localUserStore.migrate();
  const localStore = new PackBackedPracticeStore(localUserStore, bundledPuzzleStore);
  const localService = new PracticeService(localStore);
  enableSync(localService);
  const transport = new RecordingTransport(remoteSnapshot);

  try {
    assert.equal(localUserStore.countPuzzles(), 0);

    const result = await syncPracticeProgress(localStore, transport, {
      deviceId: "ipad",
      now: () => "2026-07-07T00:00:00.000Z"
    });

    assert.deepEqual(result.imported, {
      ratings: 1,
      attempts: 1,
      reviewQueue: 1,
      sprintSessions: 1
    });
    assert.equal(localUserStore.countPuzzles(), 1);
    assert.equal(localService.getRating("standard 5/20").games, 1);
    assert.equal(localService.listSprintSessions().length, 1);
    assert.equal(localService.listReviewQueue().length, 1);
    assert.equal(localService.getDueReviewItems("2026-07-07T00:00:00.000Z").length, 1);
    assert.equal(localService.getSessionMistakeReview(remoteSession?.id ?? "missing").length, 1);

    const history = localService.getHistoryView({
      now: "2026-07-07T00:00:00.000Z",
      timeRange: "max"
    });
    assert.equal(history.attempts.length, 1);
    assert.equal(history.attempts[0]?.puzzleId, remoteSnapshot.data.attempts[0]?.puzzleId);

    assert.equal(transport.saved.length, 1);
    assert.equal(transport.saved[0]?.data.attempts.length, 1);
    assert.equal(transport.saved[0]?.data.reviewQueue.length, 1);
    assert.equal(transport.saved[0]?.data.sprintSessions.length, 1);
  } finally {
    localUserStore.close();
  }
});

test("mergeLocalDataExports merges same-generation rating deltas without increasing converged RD", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  enableSync(localService);
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 700,
    ratingDeviation: 70,
    volatility: 0.05,
    games: 1
  }];
  local.attempts = [{
    id: "local-win",
    source: "sprint",
    sessionId: "local-session",
    puzzleId: "local-puzzle",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "correct",
    submittedMove: "e2e4",
    expectedMove: "e2e4",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 1_200
  }];
  local.sprintSessions = [completedRatingSprint({
    id: "local-session",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 700
  })];

  const remoteService = new PracticeService(await seededMemoryStore());
  enableSync(remoteService);
  const remote = remoteService.exportLocalData();
  remote.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 550,
    ratingDeviation: 90,
    volatility: 0.07,
    games: 1
  }];
  remote.attempts = [{
    id: "remote-loss",
    source: "sprint",
    sessionId: "remote-session",
    puzzleId: "remote-puzzle",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "wrong",
    submittedMove: "c4b5",
    expectedMove: "e2e6",
    startedAt: "2026-06-21T00:00:00.000Z",
    completedAt: "2026-06-21T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 100
  }];
  remote.sprintSessions = [completedRatingSprint({
    id: "remote-session",
    completedAt: "2026-06-21T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 550
  })];

  const merged = mergeLocalDataExports(local, remote);
  const rating = merged.ratings.find((record) => record.key === "standard 5/20");

  assert.equal(rating?.rating, 650);
  assert.equal(rating?.games, 2);
  assert.equal(rating?.ratingDeviation, 70);
  assert.equal(rating?.volatility, 0.07);
  assert.deepEqual(merged.attempts.map((attempt) => attempt.id).sort(), ["local-win", "remote-loss"]);
});

test("mergeLocalDataExports preserves converged RD when the remote snapshot has fewer games", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 775,
    ratingDeviation: 248.17054151409985,
    volatility: 0.06,
    games: 1
  }];
  local.sprintSessions = [completedRatingSprint({
    id: "local-win",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 775
  })];

  const staleRemote = structuredClone(local);
  staleRemote.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 600,
    ratingDeviation: 350,
    volatility: 0.06,
    games: 0
  }];
  staleRemote.sprintSessions = [];

  const merged = mergeLocalDataExports(local, staleRemote);

  assert.equal(merged.ratings[0]?.rating, 775);
  assert.equal(merged.ratings[0]?.games, 1);
  assert.equal(merged.ratings[0]?.ratingDeviation, 248.17054151409985);
});

test("mergeLocalDataExports repairs inflated ratings and stays idempotent", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 1_450,
    ratingDeviation: 70,
    volatility: 0.05,
    games: 2
  }];
  local.sprintSessions = [
    completedRatingSprint({
      id: "local-win",
      completedAt: "2026-06-20T00:00:05.000Z",
      ratingBefore: 600,
      ratingAfter: 700
    }),
    completedRatingSprint({
      id: "remote-loss",
      completedAt: "2026-06-21T00:00:05.000Z",
      ratingBefore: 600,
      ratingAfter: 550
    })
  ];

  const remote = structuredClone(local);
  remote.ratings[0] = {
    ...remote.ratings[0]!,
    rating: 1_300,
    ratingDeviation: 90,
    volatility: 0.07
  };

  const merged = mergeLocalDataExports(local, remote);
  const mergedAgain = mergeLocalDataExports(merged, merged);

  assert.equal(merged.ratings[0]?.rating, 650);
  assert.equal(merged.ratings[0]?.games, 2);
  assert.equal(mergedAgain.ratings[0]?.rating, 650);
  assert.equal(mergedAgain.ratings[0]?.games, 2);
});

test("PracticeService repairs a persisted rating from completed sprint sessions", async () => {
  const store = await seededMemoryStore();
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 1_450,
    ratingDeviation: 70,
    volatility: 0.05,
    games: 2
  });
  store.createSprintSession(completedSprintState({
    id: "local-win",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 700
  }));
  store.createSprintSession(completedSprintState({
    id: "remote-loss",
    completedAt: "2026-06-21T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 550
  }));

  const service = new PracticeService(store);

  assert.equal(service.getRating("standard 5/20").rating, 650);
  assert.equal(service.getRating("standard 5/20").games, 2);
});

test("mergeLocalDataExports does not apply old deltas across rating reset generations", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  enableSync(localService);
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 700,
    ratingDeviation: 70,
    volatility: 0.05,
    games: 1
  }];
  local.attempts = [{
    id: "pre-reset-win",
    source: "sprint",
    sessionId: "local-session",
    puzzleId: "local-puzzle",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "correct",
    submittedMove: "e2e4",
    expectedMove: "e2e4",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 700
  }];

  const remoteService = new PracticeService(await seededMemoryStore());
  enableSync(remoteService);
  const remote = remoteService.exportLocalData();
  remote.ratings = [{
    key: "standard 5/20",
    generation: 1,
    rating: 600,
    ratingDeviation: 350,
    volatility: 0.06,
    games: 0
  }];

  const merged = mergeLocalDataExports(local, remote);
  const rating = merged.ratings.find((record) => record.key === "standard 5/20");

  assert.equal(rating?.generation, 1);
  assert.equal(rating?.rating, 600);
  assert.equal(rating?.games, 0);
});

test("mergeLocalDataExports keeps a manual ELO anchor ahead of an older device generation", async () => {
  const oldDeviceService = new PracticeService(await seededMemoryStore());
  const oldDevice = oldDeviceService.exportLocalData();
  oldDevice.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 700,
    ratingDeviation: 70,
    volatility: 0.05,
    games: 1
  }];
  oldDevice.sprintSessions = [completedRatingSprint({
    id: "old-device-win",
    completedAt: "2026-06-20T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 700
  })];

  const editedDeviceService = new PracticeService(await seededMemoryStore());
  editedDeviceService.setRating("standard 5/20", 900);
  const editedDevice = editedDeviceService.exportLocalData();
  const merged = mergeLocalDataExports(oldDevice, editedDevice);
  const rating = merged.ratings.find((record) => record.key === "standard 5/20");

  assert.equal(rating?.generation, 1);
  assert.equal(rating?.rating, 900);
  assert.equal(rating?.games, 0);
  assert.equal(rating?.ratingDeviation, 100);
});

test("mergeLocalDataExports never reclassifies a stale-device session into a newer rating generation", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 800,
    ratingDeviation: 200,
    volatility: 0.06,
    games: 2
  }];
  local.sprintSessions = [
    completedRatingSprint({
      id: "pre-reset",
      completedAt: "2026-07-01T00:00:00.000Z",
      ratingBefore: 600,
      ratingAfter: 700,
      ratingGeneration: 0
    }),
    completedRatingSprint({
      id: "stale-device-after-reset",
      completedAt: "2026-07-03T00:00:00.000Z",
      ratingBefore: 700,
      ratingAfter: 800,
      ratingGeneration: 0
    })
  ];

  const remoteService = new PracticeService(await seededMemoryStore());
  const remote = remoteService.exportLocalData();
  remote.ratings = [{
    key: "standard 5/20",
    generation: 1,
    rating: 650,
    ratingDeviation: 250,
    volatility: 0.06,
    games: 1
  }];
  remote.sprintSessions = [completedRatingSprint({
    id: "new-generation",
    completedAt: "2026-07-02T00:00:00.000Z",
    ratingBefore: 600,
    ratingAfter: 650,
    ratingGeneration: 1
  })];

  const merged = mergeLocalDataExports(local, remote);
  const mergedAgain = mergeLocalDataExports(merged, merged);

  assert.deepEqual(mergedAgain.ratings, merged.ratings);
  assert.equal(mergedAgain.ratings[0]?.generation, 1);
  assert.equal(mergedAgain.ratings[0]?.rating, 650);
  assert.equal(mergedAgain.ratings[0]?.games, 1);
});

test("mergeLocalDataExports upgrades untagged sessions from a legacy post-reset snapshot", async () => {
  const localService = new PracticeService(await seededMemoryStore());
  const local = localService.exportLocalData();
  local.ratings = [{
    key: "standard 5/20",
    generation: 0,
    rating: 600,
    ratingDeviation: 350,
    volatility: 0.06,
    games: 0
  }];
  const legacyRemote = structuredClone(local);
  legacyRemote.ratings = [{
    key: "standard 5/20",
    generation: 1,
    rating: 650,
    ratingDeviation: 250,
    volatility: 0.06,
    games: 1
  }];
  const {
    ratingGeneration: _legacyRatingGeneration,
    ...untaggedLegacySession
  } = completedRatingSprint({
    id: "legacy-current-generation",
    completedAt: "2026-07-01T00:00:00.000Z",
    ratingBefore: 600,
    ratingAfter: 650
  });
  const {
    ratingGeneration: _staleRatingGeneration,
    ...untaggedStaleSession
  } = completedRatingSprint({
    id: "legacy-stale-generation",
    completedAt: "2026-07-02T00:00:00.000Z",
    ratingBefore: 700,
    ratingAfter: 800
  });
  legacyRemote.sprintSessions = [untaggedLegacySession, untaggedStaleSession];

  const restored = mergeLocalDataExports(local, legacyRemote);

  assert.equal(restored.ratings[0]?.rating, 650);
  assert.equal(restored.ratings[0]?.games, 1);
  assert.equal(
    restored.sprintSessions.find((session) => session.id === "legacy-current-generation")?.ratingGeneration,
    1
  );
  assert.equal(
    restored.sprintSessions.find((session) => session.id === "legacy-stale-generation")?.ratingGeneration,
    undefined
  );

  const afterAnotherGame = structuredClone(restored);
  afterAnotherGame.ratings[0] = {
    ...afterAnotherGame.ratings[0]!,
    rating: 700,
    games: 2
  };
  afterAnotherGame.sprintSessions.push(completedRatingSprint({
    id: "new-current-generation",
    completedAt: "2026-07-03T00:00:00.000Z",
    ratingBefore: 650,
    ratingAfter: 700,
    ratingGeneration: 1
  }));

  const reconciled = mergeLocalDataExports(afterAnotherGame, afterAnotherGame);

  assert.equal(reconciled.ratings[0]?.rating, 700);
  assert.equal(reconciled.ratings[0]?.games, 2);
});

test("syncPracticeProgress upgrades an existing active session to the remote terminal version", async () => {
  const sqliteStore = new SQLiteStore(":memory:");
  sqliteStore.migrate();
  const stores = [new MemoryStore(), sqliteStore];
  try {
    for (const store of stores) {
      store.createSprintSession(activeSprintState("shared-session"));
      const remoteData = store.exportLocalData();
      remoteData.sprintSessions = [completedRatingSprint({
        id: "shared-session",
        completedAt: "2026-07-01T00:01:00.000Z",
        ratingBefore: 600,
        ratingAfter: 650,
        ratingGeneration: 0
      })];
      const transport = new RecordingTransport({
        schemaVersion: 1,
        deviceId: "device-a",
        updatedAt: "2026-07-01T00:02:00.000Z",
        data: remoteData
      });

      await syncPracticeProgress(store, transport, {
        deviceId: "device-b",
        now: () => "2026-07-01T00:03:00.000Z"
      });

      assert.equal(store.listSprintSessions()[0]?.status, "won");
      assert.equal(store.listSprintSessions()[0]?.ratingAfter, 650);
      assert.equal(transport.saved[0]?.data.sprintSessions[0]?.status, "won");
      assert.equal(transport.saved[0]?.data.sprintSessions[0]?.ratingGeneration, 0);
    }
  } finally {
    sqliteStore.close();
  }
});

test("Memory and SQLite exports preserve the canonical Review order through sync serialization", async () => {
  const sqliteStore = new SQLiteStore(":memory:");
  sqliteStore.migrate();
  sqliteStore.seedPuzzles(await loadFixturePuzzles());
  const stores = [new MemoryStore(), sqliteStore];
  try {
    for (const store of stores) {
      store.recordReviewResult(
        { puzzleId: "00008", mode: "standard", ratingKey: "a-newer standard 5/30" },
        "wrong",
        "2026-06-21T12:00:00.000Z"
      );
      store.recordReviewResult(
        { puzzleId: "000hf", mode: "standard", ratingKey: "z-oldest standard 5/20" },
        "wrong",
        "2026-06-20T12:00:00.000Z"
      );
      const canonicalKeys = store.listReviewQueue().map(reviewQueueIdentity);
      const exported = store.exportLocalData();

      assert.deepEqual(canonicalKeys, [
        "2026-06-21:000hf:standard:z-oldest standard 5/20",
        "2026-06-22:00008:standard:a-newer standard 5/30"
      ]);
      assert.deepEqual(exported.reviewQueue.map(reviewQueueIdentity), canonicalKeys);
      assert.deepEqual(
        mergeLocalDataExports(exported, exported).reviewQueue.map(reviewQueueIdentity),
        canonicalKeys
      );
    }
  } finally {
    sqliteStore.close();
  }
});

test("mergeLocalDataExports does not let an imported open-session placeholder fail the owning active session", async () => {
  const service = new PracticeService(await seededMemoryStore());
  const local = service.exportLocalData();
  local.sprintSessions = [{
    id: "shared-session",
    mode: "standard",
    ratingKey: "standard 5/20",
    ratingGeneration: 0,
    startedAt: "2026-07-01T00:00:00.000Z",
    status: "active",
    correctCount: 0,
    mistakeCount: 0,
    ratingBefore: 600
  }];
  const remote = structuredClone(local);
  remote.sprintSessions[0] = {
    ...remote.sprintSessions[0]!,
    completedAt: "2026-07-01T00:00:00.000Z",
    status: "failed"
  };

  assert.equal(mergeLocalDataExports(local, remote).sprintSessions[0]?.status, "active");
  assert.equal(mergeLocalDataExports(remote, local).sprintSessions[0]?.status, "active");
});

test("syncPracticeProgress refetches and remerges after a concurrent snapshot conflict", async () => {
  const firstRemoteService = new PracticeService(await seededMemoryStore());
  enableSync(firstRemoteService);
  recordWrongStandardAttempt(firstRemoteService);
  const concurrentRemoteService = new PracticeService(await seededMemoryStore());
  enableSync(concurrentRemoteService);
  recordWrongStandardAttempt(concurrentRemoteService);
  const firstSnapshot: ProgressSyncSnapshot = {
    schemaVersion: 1,
    deviceId: "device-a",
    updatedAt: "2026-07-01T00:01:00.000Z",
    data: firstRemoteService.exportLocalData()
  };
  const concurrentSnapshot: ProgressSyncSnapshot = {
    schemaVersion: 1,
    deviceId: "device-b",
    updatedAt: "2026-07-01T00:02:00.000Z",
    data: concurrentRemoteService.exportLocalData()
  };
  const localStore = await seededMemoryStore();
  const localService = new PracticeService(localStore);
  enableSync(localService);
  const transport = new ConflictOnceTransport(firstSnapshot, concurrentSnapshot);

  const result = await syncPracticeProgress(localService, transport, {
    deviceId: "device-c",
    now: () => "2026-07-01T00:03:00.000Z"
  });

  assert.equal(transport.fetchCount, 2);
  assert.equal(transport.saveCount, 2);
  assert.equal(result.remoteUpdatedAt, concurrentSnapshot.updatedAt);
  assert.equal(transport.saved?.data.attempts.length, 2);
  assert.equal(transport.saved?.data.sprintSessions.length, 2);
});

class RecordingTransport implements ProgressSyncTransport {
  fetchCount = 0;
  readonly saved: ProgressSyncSnapshot[] = [];
  private snapshot: ProgressSyncSnapshot | undefined;

  constructor(snapshot?: ProgressSyncSnapshot) {
    this.snapshot = snapshot;
  }

  async fetchSnapshot(): Promise<ProgressSyncSnapshot | undefined> {
    this.fetchCount += 1;
    return this.snapshot;
  }

  async saveSnapshot(snapshot: ProgressSyncSnapshot): Promise<void> {
    this.saved.push(snapshot);
    this.snapshot = snapshot;
  }
}

class ConflictOnceTransport implements ProgressSyncTransport {
  fetchCount = 0;
  saveCount = 0;
  saved: ProgressSyncSnapshot | undefined;
  private snapshot: ProgressSyncSnapshot;
  private readonly concurrentSnapshot: ProgressSyncSnapshot;

  constructor(snapshot: ProgressSyncSnapshot, concurrentSnapshot: ProgressSyncSnapshot) {
    this.snapshot = snapshot;
    this.concurrentSnapshot = concurrentSnapshot;
  }

  async fetchSnapshot(): Promise<ProgressSyncSnapshot> {
    this.fetchCount += 1;
    return this.snapshot;
  }

  async saveSnapshot(snapshot: ProgressSyncSnapshot): Promise<void> {
    this.saveCount += 1;
    if (this.saveCount === 1) {
      this.snapshot = this.concurrentSnapshot;
      throw new ProgressSyncConflictError();
    }
    this.saved = snapshot;
    this.snapshot = snapshot;
  }
}

async function seededMemoryStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  return store;
}

function enableSync(service: PracticeService): void {
  service.saveSettings({
    ...service.getSettings(),
    sync: {
      iCloudEnabled: true
    }
  });
}

function disableSync(service: PracticeService): void {
  service.saveSettings({
    ...service.getSettings(),
    sync: {
      iCloudEnabled: false
    }
  });
}

function reviewQueueIdentity(review: {
  dueDay: string;
  mode: string;
  puzzleId: string;
  ratingKey: string;
}): string {
  return `${review.dueDay}:${review.puzzleId}:${review.mode}:${review.ratingKey}`;
}

function recordWrongStandardAttempt(service: PracticeService): void {
  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}

function completedRatingSprint({
  id,
  completedAt,
  ratingBefore,
  ratingAfter,
  ratingGeneration = 0
}: {
  id: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingGeneration?: number;
}) {
  return {
    id,
    mode: "standard" as const,
    ratingKey: "standard 5/20",
    ratingGeneration,
    startedAt: completedAt,
    completedAt,
    status: "won" as const,
    correctCount: 1,
    mistakeCount: 0,
    ratingBefore,
    ratingAfter
  };
}

function activeSprintState(id: string): SprintState {
  return {
    id,
    config: defaultSprintConfig("standard"),
    ratingGeneration: 0,
    status: "active",
    startedAt: "2026-07-01T00:00:00.000Z",
    deadlineAt: "2026-07-01T00:05:00.000Z",
    correctCount: 0,
    mistakeCount: 0,
    currentStreak: 0,
    bestStreak: 0,
    hasUserSubmittedMove: false,
    currentPuzzleIndex: 0,
    puzzles: [],
    ratingBefore: 600
  };
}

function completedSprintState({
  id,
  completedAt,
  ratingBefore,
  ratingAfter
}: {
  id: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter: number;
}): SprintState {
  return {
    id,
    config: defaultSprintConfig("standard"),
    status: "won",
    startedAt: completedAt,
    deadlineAt: completedAt,
    completedAt,
    endReason: "target_reached",
    correctCount: 1,
    mistakeCount: 0,
    currentStreak: 1,
    bestStreak: 1,
    hasUserSubmittedMove: true,
    currentPuzzleIndex: 1,
    puzzles: [],
    ratingBefore,
    ratingAfter
  };
}
