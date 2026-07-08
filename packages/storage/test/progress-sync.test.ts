import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MemoryStore, PracticeService, syncPracticeProgress } from "../src/index.ts";
import type { ProgressSyncSnapshot, ProgressSyncTransport } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

test("syncPracticeProgress does not touch transport while iCloud sync is disabled", async () => {
  const store = await seededMemoryStore();
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
