import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MemoryStore, PracticeService, mergeLocalDataExports, syncPracticeProgress } from "../src/index.ts";
import type { ProgressSyncSnapshot, ProgressSyncTransport } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

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
  assert.equal((localService.listHistory() as unknown[]).length, 1);
  assert.equal(localService.getRating("standard 5/20").games, 1);
  assert.equal(localService.listReviewQueue().length, 1);
  assert.equal(transport.saved.length, 1);
  assert.equal(transport.saved[0]?.data.attempts.length, 1);
  assert.equal(transport.saved[0]?.data.settings.sync.iCloudEnabled, true);
});

test("mergeLocalDataExports conservatively merges same-generation rating deltas", async () => {
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
    ratingAfter: 700
  }];

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
    ratingAfter: 550
  }];

  const merged = mergeLocalDataExports(local, remote);
  const rating = merged.ratings.find((record) => record.key === "standard 5/20");

  assert.equal(rating?.rating, 650);
  assert.equal(rating?.games, 2);
  assert.equal(rating?.ratingDeviation, 90);
  assert.equal(rating?.volatility, 0.07);
  assert.deepEqual(merged.attempts.map((attempt) => attempt.id).sort(), ["local-win", "remote-loss"]);
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
