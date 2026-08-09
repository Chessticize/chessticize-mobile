import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

process.env.TZ = "UTC";

import {
  PROGRESS_V2_FORMAT_VERSION,
  FakeProgressV2Transport,
  MemoryStore,
  PracticeService,
  ProgressV2SyncCancelledError,
  SQLiteStore,
  canonicalJson,
  decodeProgressV2Record,
  progressV2RecordName,
  ratingEntityKey,
  syncPracticeProgressV2
} from "../src/index.ts";
import type { ProgressSyncSnapshot, ProgressV2Record } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

test("the maintained in-memory store does not swallow local work during its first pull", async () => {
  const store = new MemoryStore();
  const service = new PracticeService(store);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  service.setRating("standard 5/20", 921);

  await syncPracticeProgressV2(service, transport, {
    deviceId: "memory-device",
    now: () => "2026-08-09T11:59:00.000Z"
  });

  const rating = transport.records
    .filter((record) => record.kind === "rating")
    .map((record) => decodeProgressV2Record(record))
    .find((payload) => payload.state === "present" &&
      typeof payload.value === "object" && payload.value !== null &&
      "key" in payload.value && payload.value.key === "standard 5/20" &&
      "generation" in payload.value && payload.value.generation === 1);
  assert.equal(
    rating?.state === "present" && typeof rating.value === "object" &&
      rating.value !== null && "rating" in rating.value
      ? rating.value.rating
      : undefined,
    921
  );
});

test("a new user initializes V2 when the legacy V1 snapshot does not exist", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({
    ...service.getSettings(),
    sync: { iCloudEnabled: true }
  });
  const transport = new FakeProgressV2Transport({ legacy: "missing" });

  try {
    const result = await syncPracticeProgressV2(service, transport, {
      deviceId: "device-new",
      now: () => "2026-08-09T12:00:00.000Z"
    });

    assert.equal(result.status, "synced");
    assert.equal(result.phase, "bridging");
    assert.equal(result.legacy.status, "missing");
    assert.equal(transport.legacyMetadataFetchCount, 1);
    assert.equal(transport.legacySnapshotFetchCount, 0);
    assert.equal(transport.legacyWriteCount, 0);
    assert.equal(transport.zoneInitializationCount, 1);
    assert.equal(transport.records.some((record) => record.kind === "manifest"), true);
    assert.equal(transport.records.some((record) => record.kind === "preferences"), true);
    assert.notEqual(service.getProgressV2Diagnostics().serverChangeTokenFingerprint, undefined);
    assert.equal(service.getProgressV2Diagnostics().pendingOutboxCount, 0);
    assert.equal(service.getProgressV2Diagnostics().lastV1CheckStatus, "missing");
    assert.equal(service.getProgressV2Diagnostics().lastV1CheckAt, "2026-08-09T12:00:00.000Z");
  } finally {
    store.close();
  }
});

test("a transient V1 metadata failure is not remembered as a missing legacy record", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  const originalMetadata = transport.fetchLegacyMetadata.bind(transport);
  let failMetadata = true;
  transport.fetchLegacyMetadata = async () => {
    if (failMetadata) {
      failMetadata = false;
      throw new Error("temporary CloudKit metadata failure");
    }
    return originalMetadata();
  };

  try {
    await assert.rejects(
      syncPracticeProgressV2(service, transport, {
        deviceId: "metadata-retry-device",
        now: () => "2026-08-09T12:00:00.000Z"
      }),
      /temporary CloudKit metadata failure/
    );
    assert.equal(service.getProgressV2Diagnostics().lastV1ChangeTag, undefined);
    assert.equal(service.getProgressV2Diagnostics().lastV1CheckStatus, undefined);
    assert.equal(service.getProgressV2Diagnostics().pendingOutboxCount > 0, true);

    const retried = await syncPracticeProgressV2(service, transport, {
      deviceId: "metadata-retry-device",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    assert.equal(retried.legacy.status, "missing");
    assert.equal(service.getProgressV2Diagnostics().lastV1CheckStatus, "missing");
    assert.equal(service.getProgressV2Diagnostics().lastV1CheckAt, "2026-08-09T12:01:00.000Z");
    assert.equal(transport.legacySnapshotFetchCount, 0);
    assert.equal(service.getProgressV2Diagnostics().pendingOutboxCount, 0);
  } finally {
    store.close();
  }
});

test("a V2-only second device imports incremental records and keeps iCloudEnabled local", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    firstService.saveSettings({
      ...firstService.getSettings(),
      sync: { iCloudEnabled: true },
      moveFeedback: { soundEnabled: false, hapticsEnabled: false }
    });
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:00:00.000Z"
    });

    secondService.saveSettings({
      ...secondService.getSettings(),
      sync: { iCloudEnabled: true },
      moveFeedback: { soundEnabled: true, hapticsEnabled: true }
    });
    const result = await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:01:00.000Z"
    });

    assert.equal(result.pulledRecordCount > 0, true);
    assert.deepEqual(secondService.getSettings().moveFeedback, {
      soundEnabled: false,
      hapticsEnabled: false
    });
    assert.equal(secondService.getSettings().sync.iCloudEnabled, true);
    assert.equal(transport.legacyWriteCount, 0);
  } finally {
    first.close();
    second.close();
  }
});

test("changing only synced settings uploads one small preferences record", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
    await syncPracticeProgressV2(service, transport, {
      deviceId: "settings-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    const batchCount = transport.modifyBatches.length;

    service.saveSettings({
      ...service.getSettings(),
      moveFeedback: { soundEnabled: true, hapticsEnabled: false }
    });
    await syncPracticeProgressV2(service, transport, {
      deviceId: "settings-device",
      now: () => "2026-08-09T12:01:00.000Z"
    });

    const newBatches = transport.modifyBatches.slice(batchCount);
    assert.equal(newBatches.length, 1);
    assert.deepEqual(newBatches[0]?.saving.map((record) => record.kind), ["preferences"]);
    assert.deepEqual(newBatches[0]?.deleting, []);
  } finally {
    store.close();
  }
});

test("changing local-only settings does not enqueue a cloud preferences write", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
    await syncPracticeProgressV2(service, transport, {
      deviceId: "settings-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    const batchCount = transport.modifyBatches.length;

    service.saveSettings({
      ...service.getSettings(),
      sync: { iCloudEnabled: false },
      sprintGuides: {
        ...service.getSettings().sprintGuides,
        rulesSeen: true
      }
    });

    assert.equal(service.getProgressV2Diagnostics().pendingOutboxCount, 0);
    assert.equal(transport.modifyBatches.length, batchCount);
  } finally {
    store.close();
  }
});

test("an already-synced device keeps its pending offline preferences during pull", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
    secondService.saveSettings({ ...secondService.getSettings(), sync: { iCloudEnabled: true } });
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:01:00.000Z"
    });

    firstService.saveSettings({
      ...firstService.getSettings(),
      moveFeedback: { soundEnabled: true, hapticsEnabled: true }
    });
    secondService.saveSettings({
      ...secondService.getSettings(),
      moveFeedback: { soundEnabled: false, hapticsEnabled: false }
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:02:00.000Z"
    });
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:03:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:04:00.000Z"
    });

    assert.deepEqual(firstService.getSettings().moveFeedback, {
      soundEnabled: true,
      hapticsEnabled: true
    });
    assert.deepEqual(secondService.getSettings().moveFeedback, {
      soundEnabled: true,
      hapticsEnabled: true
    });
  } finally {
    first.close();
    second.close();
  }
});

test("multiple offline rating resets preserve every generation anchor", async () => {
  const store = new SQLiteStore(":memory:");
  const restoredStore = new SQLiteStore(":memory:");
  store.migrate();
  restoredStore.migrate();
  const service = new PracticeService(store);
  const restoredService = new PracticeService(restoredStore);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
    service.resetRating("standard 5/20");
    service.resetRating("standard 5/20");
    await syncPracticeProgressV2(service, transport, {
      deviceId: "offline-reset-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });

    const generations = transport.records
      .filter((record) => record.kind === "rating")
      .map((record) => decodeProgressV2Record(record))
      .map((payload) =>
        payload.state === "present" && typeof payload.value === "object" &&
          payload.value !== null && "generation" in payload.value
          ? payload.value.generation
          : undefined
      )
      .sort();
    assert.deepEqual(generations, [0, 1, 2]);

    restoredService.saveSettings({
      ...restoredService.getSettings(),
      sync: { iCloudEnabled: true }
    });
    await syncPracticeProgressV2(restoredService, transport, {
      deviceId: "restored-device",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    assert.deepEqual(
      restoredStore.progressV2.exportData().ratings
        .filter((rating) => rating.key === "standard 5/20")
        .map((rating) => rating.generation),
      [0, 1, 2]
    );
  } finally {
    store.close();
    restoredStore.close();
  }
});

test("an existing V1 user imports once, writes only V2 records, and then uses metadata-only checks", async () => {
  const legacyStore = new SQLiteStore(":memory:");
  const upgradedStore = new SQLiteStore(":memory:");
  legacyStore.migrate();
  upgradedStore.migrate();
  const legacyService = new PracticeService(legacyStore);
  const upgradedService = new PracticeService(upgradedStore);
  legacyService.setRating("standard 5/20", 912);
  const legacySnapshot: ProgressSyncSnapshot = {
    schemaVersion: 1,
    deviceId: "old-device",
    updatedAt: "2026-08-09T11:00:00.000Z",
    data: legacyService.exportLocalData()
  };
  const transport = new FakeProgressV2Transport({
    legacy: { changeTag: "v1-tag-7", snapshot: legacySnapshot }
  });
  upgradedService.saveSettings({
    ...upgradedService.getSettings(),
    sync: { iCloudEnabled: true }
  });

  try {
    const migrated = await syncPracticeProgressV2(upgradedService, transport, {
      deviceId: "upgraded-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });

    assert.equal(migrated.legacy.status, "imported");
    assert.equal(upgradedService.getRating("standard 5/20").rating, 912);
    assert.equal(transport.legacySnapshotFetchCount, 1);
    assert.equal(transport.legacyWriteCount, 0);
    assert.equal(transport.records.some((record) => record.kind === "rating"), true);
    assert.equal(upgradedService.getProgressV2Diagnostics().lastV1ChangeTag, "v1-tag-7");
    assert.equal(upgradedService.getProgressV2Diagnostics().pendingOutboxCount, 0);

    const unchanged = await syncPracticeProgressV2(upgradedService, transport, {
      deviceId: "upgraded-device",
      now: () => "2026-08-09T12:05:00.000Z"
    });
    assert.equal(unchanged.legacy.status, "unchanged");
    assert.equal(transport.legacyMetadataFetchCount, 2);
    assert.equal(transport.legacySnapshotFetchCount, 1);
  } finally {
    legacyStore.close();
    upgradedStore.close();
  }
});

test("bridging imports a V1 snapshot that appears after the device already started on V2", async () => {
  const v2Store = new SQLiteStore(":memory:");
  const oldStore = new SQLiteStore(":memory:");
  v2Store.migrate();
  oldStore.migrate();
  const v2Service = new PracticeService(v2Store);
  const oldService = new PracticeService(oldStore);
  v2Service.saveSettings({ ...v2Service.getSettings(), sync: { iCloudEnabled: true } });
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    const first = await syncPracticeProgressV2(v2Service, transport, {
      deviceId: "v2-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    assert.equal(first.legacy.status, "missing");

    oldService.setRating("standard 5/20", 1040);
    transport.setLegacy({
      changeTag: "late-old-device-tag",
      snapshot: {
        schemaVersion: 1,
        deviceId: "old-device",
        updatedAt: "2026-08-09T12:10:00.000Z",
        data: oldService.exportLocalData()
      }
    });
    const second = await syncPracticeProgressV2(v2Service, transport, {
      deviceId: "v2-device",
      now: () => "2026-08-09T12:11:00.000Z"
    });

    assert.equal(second.legacy.status, "imported");
    assert.equal(v2Service.getRating("standard 5/20").rating, 1040);
    assert.equal(v2Service.getProgressV2Diagnostics().lastV1ChangeTag, "late-old-device-tag");
    assert.equal(transport.legacySnapshotFetchCount, 1);
  } finally {
    v2Store.close();
    oldStore.close();
  }
});

test("bridging normalizes V1 snapshots created before newer settings and record families existed", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  const legacy = structuredClone(service.exportLocalData()) as unknown as Record<string, unknown>;
  const legacySettings = legacy.settings as Record<string, unknown>;
  delete legacySettings.moveFeedback;
  delete legacySettings.sprintGuides;
  delete legacy.practiceRuns;
  delete legacy.reviewRemovals;
  const transport = new FakeProgressV2Transport({
    legacy: {
      changeTag: "old-shape",
      snapshot: {
        schemaVersion: 1,
        deviceId: "old-version",
        updatedAt: "2026-08-09T11:00:00.000Z",
        data: legacy
      }
    }
  });
  try {
    const result = await syncPracticeProgressV2(service, transport, {
      deviceId: "upgraded-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    assert.equal(result.legacy.status, "imported");
    assert.deepEqual(service.getSettings().moveFeedback, {
      soundEnabled: false,
      hapticsEnabled: true
    });
  } finally {
    store.close();
  }
});

test("a sealed V2 manifest prevents every V1 metadata and payload request", async () => {
  const manifestIdentity = { kind: "manifest" as const, entityKey: "default" };
  const transport = new FakeProgressV2Transport({
    legacy: {
      changeTag: "must-not-be-read",
      snapshot: { invalid: "must-not-be-read" }
    },
    records: [{
      recordName: progressV2RecordName(manifestIdentity),
      kind: "manifest",
      schemaVersion: PROGRESS_V2_FORMAT_VERSION,
      payload: canonicalJson({
        formatVersion: PROGRESS_V2_FORMAT_VERSION,
        kind: "manifest",
        entityKey: "default",
        state: "present",
        value: {
          phase: "sealed",
          minimumWriterVersion: "1.5",
          migrationStartedAt: "2026-08-01T00:00:00.000Z",
          sealedAt: "2026-08-09T00:00:00.000Z"
        }
      })
    }]
  });
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  try {
    const result = await syncPracticeProgressV2(service, transport, {
      deviceId: "sealed-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    assert.equal(result.phase, "sealed");
    assert.equal(result.legacy.status, "skipped_sealed");
    assert.equal(transport.legacyMetadataFetchCount, 0);
    assert.equal(transport.legacySnapshotFetchCount, 0);
    const cloudManifest = transport.records.find((record) => record.kind === "manifest");
    const cloudPayload = decodeProgressV2Record(cloudManifest!);
    assert.equal(
      cloudPayload.state === "present" && cloudPayload.kind === "manifest" &&
        typeof cloudPayload.value === "object" && cloudPayload.value !== null &&
        "phase" in cloudPayload.value
        ? cloudPayload.value.phase
        : undefined,
      "sealed"
    );
  } finally {
    store.close();
  }
});

test("a stale bridging manifest cannot reopen a device that already observed seal", async () => {
  const identity = { kind: "manifest" as const, entityKey: "default" };
  const manifest = (phase: "bridging" | "sealed", timestamp: string) => ({
    recordName: progressV2RecordName(identity),
    kind: "manifest" as const,
    schemaVersion: PROGRESS_V2_FORMAT_VERSION,
    payload: canonicalJson({
      formatVersion: PROGRESS_V2_FORMAT_VERSION,
      kind: "manifest",
      entityKey: "default",
      state: "present",
      value: {
        phase,
        minimumWriterVersion: phase === "sealed" ? "1.5" : "1.4-v2",
        migrationStartedAt: "2026-08-01T00:00:00.000Z",
        ...(phase === "sealed" ? { sealedAt: timestamp } : {})
      }
    })
  });
  const transport = new FakeProgressV2Transport({
    legacy: { changeTag: "must-not-read", snapshot: { invalid: true } },
    records: [manifest("sealed", "2026-08-09T00:00:00.000Z")]
  });
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  try {
    await syncPracticeProgressV2(service, transport, {
      deviceId: "sealed-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    await transport.modifyRecords({
      saving: [manifest("bridging", "2026-08-09T12:01:00.000Z")],
      deleting: []
    });

    const result = await syncPracticeProgressV2(service, transport, {
      deviceId: "sealed-device",
      now: () => "2026-08-09T12:02:00.000Z"
    });

    assert.equal(result.phase, "sealed");
    assert.equal(result.legacy.status, "skipped_sealed");
    assert.equal(transport.legacyMetadataFetchCount, 0);
    assert.equal(transport.legacySnapshotFetchCount, 0);
    const repairedManifest = transport.records.find((record) => record.kind === "manifest");
    const repairedPayload = decodeProgressV2Record(repairedManifest!);
    assert.equal(
      repairedPayload.state === "present" && repairedPayload.kind === "manifest" &&
        typeof repairedPayload.value === "object" && repairedPayload.value !== null &&
        "phase" in repairedPayload.value
        ? repairedPayload.value.phase
        : undefined,
      "sealed"
    );
  } finally {
    store.close();
  }
});

test("clearSyncedHistory keeps the API internal and publishes durable deletion tombstones", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-08-09T12:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-08-09T12:00:05.000Z");
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    await syncPracticeProgressV2(service, transport, {
      deviceId: "deleting-device",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    assert.equal(service.listHistory().length, 1);
    assert.equal("clearLocalHistory" in service, false);

    const cleared = service.clearSyncedHistory("2026-08-09T12:02:00.000Z");
    assert.deepEqual(cleared, {
      attempts: 1,
      reviewEvents: 0,
      reviewQueue: 1,
      sprintSessions: 1
    });
    assert.equal(service.listHistory().length, 0);
    await syncPracticeProgressV2(service, transport, {
      deviceId: "deleting-device",
      now: () => "2026-08-09T12:03:00.000Z"
    });

    const attempt = transport.records.find((record) => record.kind === "attempt");
    const session = transport.records.find((record) => record.kind === "sprint_session");
    const review = transport.records.find((record) => record.kind === "review_schedule");
    assert.equal(attempt && decodeProgressV2Record(attempt).state, "deleted");
    assert.equal(session && decodeProgressV2Record(session).state, "deleted");
    const reviewPayload = review && decodeProgressV2Record(review);
    assert.equal(
      reviewPayload?.state === "present" &&
        typeof reviewPayload.value === "object" &&
        reviewPayload.value !== null &&
        "kind" in reviewPayload.value
        ? reviewPayload.value.kind
        : undefined,
      "removed"
    );
  } finally {
    store.close();
  }
});

test("a clearSyncedHistory tombstone removes history on another V2 device without resurrection", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const puzzles = await loadFixturePuzzles();
  first.seedPuzzles(puzzles);
  second.seedPuzzles(puzzles);
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
  secondService.saveSettings({ ...secondService.getSettings(), sync: { iCloudEnabled: true } });
  firstService.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-08-09T12:00:00.000Z"
  );
  firstService.submitMove("c4b5", "2026-08-09T12:00:05.000Z");
  const staleLegacyData = structuredClone(firstService.exportLocalData());
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:02:00.000Z"
    });
    assert.equal(secondService.listHistory().length, 1);

    firstService.clearSyncedHistory("2026-08-09T12:03:00.000Z");
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:04:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:05:00.000Z"
    });

    assert.equal(secondService.listHistory().length, 0);
    assert.equal(secondService.listSprintSessions().length, 0);
    assert.equal(secondService.listReviewQueue().length, 0);
    assert.equal(secondService.getProgressV2Diagnostics().pendingOutboxCount, 0);

    transport.setLegacy({
      changeTag: "stale-old-device-after-clear",
      snapshot: {
        schemaVersion: 1,
        deviceId: "old-device",
        updatedAt: "2026-08-09T12:06:00.000Z",
        data: staleLegacyData
      }
    });
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:07:00.000Z"
    });
    assert.equal(firstService.listHistory().length, 0);
    assert.equal(
      transport.records.find((record) => record.kind === "attempt") &&
        decodeProgressV2Record(transport.records.find((record) => record.kind === "attempt")!).state,
      "deleted"
    );
  } finally {
    first.close();
    second.close();
  }
});

test("a physical CloudKit record deletion is applied idempotently and cannot resurrect locally", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const puzzles = await loadFixturePuzzles();
  first.seedPuzzles(puzzles);
  second.seedPuzzles(puzzles);
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
    secondService.saveSettings({ ...secondService.getSettings(), sync: { iCloudEnabled: true } });
    firstService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-08-09T12:00:00.000Z"
    );
    firstService.submitMove("c4b5", "2026-08-09T12:00:05.000Z");
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:02:00.000Z"
    });
    const attemptRecord = transport.records.find((record) => record.kind === "attempt");
    assert.ok(attemptRecord);
    assert.equal(secondService.listHistory().length, 1);

    transport.physicallyDeleteRecord(attemptRecord.recordName);
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:03:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:04:00.000Z"
    });

    assert.equal(secondService.listHistory().length, 0);
    assert.equal(secondService.getProgressV2Diagnostics().pendingOutboxCount, 0);
  } finally {
    first.close();
    second.close();
  }
});

test("two V2 devices converge concurrent offline progress from duplicated out-of-order changes", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const puzzles = await loadFixturePuzzles();
  first.seedPuzzles(puzzles);
  second.seedPuzzles(puzzles);
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
  secondService.saveSettings({ ...secondService.getSettings(), sync: { iCloudEnabled: true } });
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:01:00.000Z"
    });

    firstService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-08-09T12:02:00.000Z"
    );
    firstService.submitMove("c4b5", "2026-08-09T12:02:05.000Z");
    secondService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-08-09T12:03:00.000Z"
    );
    secondService.submitMove("c4b5", "2026-08-09T12:03:05.000Z");

    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:04:00.000Z"
    });
    transport.duplicateAndReverseNextFetch();
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:05:00.000Z"
    });
    transport.duplicateAndReverseNextFetch();
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:06:00.000Z"
    });

    assert.deepEqual(
      firstService.listHistory().map((attempt) => attempt.id).sort(),
      secondService.listHistory().map((attempt) => attempt.id).sort()
    );
    assert.equal(firstService.listHistory().length, 2);
    assert.deepEqual(firstService.getRating("standard 5/20"), secondService.getRating("standard 5/20"));
    assert.equal(transport.records.filter((record) => record.kind === "attempt").length, 2);
    assert.equal(firstService.getProgressV2Diagnostics().pendingOutboxCount, 0);
    assert.equal(secondService.getProgressV2Diagnostics().pendingOutboxCount, 0);
  } finally {
    first.close();
    second.close();
  }
});

test("an expired zone token rebuilds the V2 replica without losing unsent local outbox records", async () => {
  const first = new SQLiteStore(":memory:");
  const second = new SQLiteStore(":memory:");
  first.migrate();
  second.migrate();
  const puzzles = await loadFixturePuzzles();
  first.seedPuzzles(puzzles);
  second.seedPuzzles(puzzles);
  const firstService = new PracticeService(first);
  const secondService = new PracticeService(second);
  firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
  secondService.saveSettings({ ...secondService.getSettings(), sync: { iCloudEnabled: true } });
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:01:00.000Z"
    });
    firstService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-08-09T12:02:00.000Z"
    );
    firstService.submitMove("c4b5", "2026-08-09T12:02:05.000Z");
    await syncPracticeProgressV2(firstService, transport, {
      deviceId: "device-a",
      now: () => "2026-08-09T12:03:00.000Z"
    });
    secondService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-08-09T12:04:00.000Z"
    );
    secondService.submitMove("c4b5", "2026-08-09T12:04:05.000Z");
    const pendingBefore = secondService.getProgressV2Diagnostics().pendingOutboxCount;
    assert.equal(pendingBefore > 0, true);

    transport.expireNextTokenFetch();
    await syncPracticeProgressV2(secondService, transport, {
      deviceId: "device-b",
      now: () => "2026-08-09T12:05:00.000Z"
    });

    assert.equal(secondService.listHistory().length, 2);
    assert.equal(secondService.getProgressV2Diagnostics().pendingOutboxCount, 0);
    assert.equal(transport.records.filter((record) => record.kind === "attempt").length, 2);
  } finally {
    first.close();
    second.close();
  }
});

test("an invalid remote V2 record rolls back the batch and does not advance the token", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
    await syncPracticeProgressV2(service, transport, {
      deviceId: "corruption-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });
    const fingerprintBefore = service.getProgressV2Diagnostics().serverChangeTokenFingerprint;
    await transport.modifyRecords({
      saving: [{
        recordName: "v2|attempt|corrupt-attempt",
        kind: "attempt",
        schemaVersion: PROGRESS_V2_FORMAT_VERSION,
        payload: canonicalJson({
          formatVersion: PROGRESS_V2_FORMAT_VERSION,
          kind: "attempt",
          entityKey: "corrupt-attempt",
          state: "present",
          value: { id: "corrupt-attempt" }
        })
      }],
      deleting: []
    });

    await assert.rejects(
      syncPracticeProgressV2(service, transport, {
        deviceId: "corruption-device",
        now: () => "2026-08-09T12:01:00.000Z"
      }),
      /invalid domain data/
    );
    assert.equal(service.listHistory().length, 0);
    assert.equal(
      service.getProgressV2Diagnostics().serverChangeTokenFingerprint,
      fingerprintBefore
    );
  } finally {
    store.close();
  }
});

test("partial V2 saves acknowledge successes and retry the durable outbox after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-v2-retry-"));
  const databasePath = join(directory, "progress.sqlite");
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  try {
    const first = new SQLiteStore(databasePath);
    first.migrate();
    const firstService = new PracticeService(first);
    firstService.saveSettings({ ...firstService.getSettings(), sync: { iCloudEnabled: true } });
    firstService.setRating("standard 5/20", 987);
    transport.failNextSaveForKind("rating");

    await assert.rejects(
      syncPracticeProgressV2(firstService, transport, {
        deviceId: "retry-device",
        now: () => "2026-08-09T12:00:00.000Z"
      }),
      /partially saved/
    );
    assert.equal(firstService.getProgressV2Diagnostics().pendingOutboxCount, 1);
    assert.equal(
      transport.records.some((record) =>
        record.recordName === progressV2RecordName({
          kind: "rating",
          entityKey: ratingEntityKey("standard 5/20", 0)
        })
      ),
      false
    );
    const tokenFingerprint = firstService.getProgressV2Diagnostics().serverChangeTokenFingerprint;
    first.close();

    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    const reopenedService = new PracticeService(reopened);
    try {
      assert.equal(
        reopenedService.getProgressV2Diagnostics().serverChangeTokenFingerprint,
        tokenFingerprint
      );
      const retried = await syncPracticeProgressV2(reopenedService, transport, {
        deviceId: "retry-device",
        now: () => "2026-08-09T12:01:00.000Z"
      });
      assert.equal(retried.status, "synced");
      assert.equal(reopenedService.getProgressV2Diagnostics().pendingOutboxCount, 0);
      assert.equal(
        transport.records.filter((record) =>
          record.recordName === progressV2RecordName({
            kind: "rating",
            entityKey: ratingEntityKey("standard 5/20", 0)
          })
        ).length,
        1
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("diagnostics count the complete outbox rather than only one 400-record upload batch", () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  try {
    const initialPending = service.getProgressV2Diagnostics().pendingOutboxCount;
    service.progressV2.stageOutbox(
      Array.from({ length: 405 }, (_, index) => ({
        kind: "attempt" as const,
        entityKey: `pending-${index}`
      })),
      "2026-08-09T12:00:00.000Z"
    );
    assert.equal(service.progressV2.listOutbox().length, 400);
    assert.equal(
      service.getProgressV2Diagnostics().pendingOutboxCount,
      initialPending + 405
    );
    assert.equal(
      service.getProgressV2Diagnostics().oldestPendingOutboxAt,
      "2026-08-09T12:00:00.000Z"
    );
  } finally {
    store.close();
  }
});

test("an upload confirmation cannot acknowledge a newer local write to the same record", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  const originalPreferenceOutbox = service.progressV2.listOutbox().find(
    (entry) => entry.kind === "preferences"
  );
  assert.ok(originalPreferenceOutbox);
  const transport = new FakeProgressV2Transport({ legacy: "missing" });
  const originalModify = transport.modifyRecords.bind(transport);
  let changedDuringUpload = false;
  transport.modifyRecords = async (input) => {
    if (!changedDuringUpload && input.saving.some((record) => record.kind === "preferences")) {
      changedDuringUpload = true;
      service.saveSettings({
        ...service.getSettings(),
        moveFeedback: { soundEnabled: false, hapticsEnabled: false }
      });
      service.progressV2.stageOutbox(
        [{ kind: "preferences", entityKey: "default" }],
        originalPreferenceOutbox.enqueuedAt
      );
    }
    return originalModify(input);
  };

  try {
    await syncPracticeProgressV2(service, transport, {
      deviceId: "concurrent-write-device",
      now: () => "2026-08-09T12:00:00.000Z"
    });

    const preferenceSaves = transport.modifyBatches.flatMap((batch) =>
      batch.saving.filter((record) => record.kind === "preferences")
    );
    assert.equal(preferenceSaves.length, 2);
    assert.deepEqual(
      decodeProgressV2Record(transport.records.find((record) => record.kind === "preferences")!).value,
      {
        notifications: service.getSettings().notifications,
        moveFeedback: { soundEnabled: false, hapticsEnabled: false }
      }
    );
    assert.equal(service.getProgressV2Diagnostics().pendingOutboxCount, 0);
  } finally {
    store.close();
  }
});

test("turning Sync Off while a pull is in flight prevents imports and pushes", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const service = new PracticeService(store);
  service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: true } });
  const transport = new FakeProgressV2Transport({ records: [samplePreferencesRecord()] });
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>((resolveGate) => {
    releaseFetch = resolveGate;
  });
  const originalFetch = transport.fetchZoneChanges.bind(transport);
  transport.fetchZoneChanges = async (token) => {
    await fetchGate;
    return originalFetch(token);
  };
  let current = true;
  try {
    const syncing = syncPracticeProgressV2(service, transport, {
      deviceId: "cancelled-device",
      now: () => "2026-08-09T12:00:00.000Z",
      isCurrent: () => current
    });
    await Promise.resolve();
    current = false;
    service.saveSettings({ ...service.getSettings(), sync: { iCloudEnabled: false } });
    releaseFetch();

    await assert.rejects(syncing, ProgressV2SyncCancelledError);
    assert.deepEqual(service.getSettings().moveFeedback, {
      soundEnabled: false,
      hapticsEnabled: true
    });
    assert.equal(transport.modifyBatches.length, 0);
    assert.equal(transport.legacyMetadataFetchCount, 0);
  } finally {
    store.close();
  }
});

function samplePreferencesRecord(): ProgressV2Record {
  const identity = { kind: "preferences" as const, entityKey: "default" };
  return {
    recordName: progressV2RecordName(identity),
    kind: "preferences",
    schemaVersion: PROGRESS_V2_FORMAT_VERSION,
    payload: canonicalJson({
      formatVersion: PROGRESS_V2_FORMAT_VERSION,
      kind: "preferences",
      entityKey: "default",
      state: "present",
      value: {
        notifications: { reviewReminder: { mode: "off" } },
        moveFeedback: { soundEnabled: true, hapticsEnabled: false }
      }
    })
  };
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  return JSON.parse(
    await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8")
  ) as Puzzle[];
}
