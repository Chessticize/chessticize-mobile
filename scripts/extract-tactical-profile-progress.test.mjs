import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  extractLatestTacticalProfileProgress,
  parseExtractionArguments
} from "./extract-tactical-profile-progress.mjs";

test("extraction arguments require one container and one output", () => {
  assert.deepEqual(
    parseExtractionArguments([
      "--container",
      "downloaded-container",
      "--output",
      "scratch/progress.json"
    ]),
    {
      containerPath: resolve("downloaded-container"),
      outputPath: resolve("scratch/progress.json")
    }
  );
  assert.throws(
    () => parseExtractionArguments(["--container", "downloaded-container"]),
    /--output is required/
  );
  assert.throws(
    () => parseExtractionArguments([
      "--container",
      "one",
      "--container",
      "two",
      "--output",
      "progress.json"
    ]),
    /--container may only be provided once/
  );
  assert.throws(
    () => parseExtractionArguments([
      "--container",
      "one",
      "--output",
      "progress.json",
      "--unknown",
      "value"
    ]),
    /Unexpected argument --unknown/
  );
});

test("extracts the newest distinct canonical snapshot with private permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactical-progress-extract-"));
  const assets = join(
    directory,
    "com.chessticize.mobile",
    "Library",
    "Caches",
    "CloudKit",
    "cache-id",
    "Assets"
  );
  const output = join(directory, "private", "progress.json");
  try {
    await mkdir(assets, { recursive: true });
    const older = progressExport("old-attempt", "old-session");
    const newest = progressExport("new-attempt", "new-session");
    await Promise.all([
      writeSnapshot(join(assets, "old"), "2026-07-25T12:00:00.000Z", older),
      writeSnapshot(join(assets, "new-a"), "2026-07-26T12:00:00.000Z", newest),
      writeSnapshot(join(assets, "new-b"), "2026-07-26T12:00:00.000Z", newest),
      writeFile(join(assets, "unrelated"), JSON.stringify({ data: "not-progress" }))
    ]);

    const result = await extractLatestTacticalProfileProgress({
      containerPath: join(directory, "com.chessticize.mobile"),
      outputPath: output
    });

    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), newest);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.deepEqual(result, {
      outputPath: output,
      discoveredSnapshotCount: 3,
      distinctSnapshotCount: 2,
      attemptCount: 1,
      sprintSessionCount: 1
    });
    await assert.rejects(
      extractLatestTacticalProfileProgress({
        containerPath: join(directory, "com.chessticize.mobile"),
        outputPath: output
      }),
      /EEXIST/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("supports an xcappdata AppData layout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactical-xcappdata-extract-"));
  const container = join(directory, "Chessticize.xcappdata");
  const assets = join(
    container,
    "AppData",
    "Library",
    "Caches",
    "CloudKit",
    "cache-id",
    "Assets"
  );
  const output = join(directory, "progress.json");
  try {
    await mkdir(assets, { recursive: true });
    await writeSnapshot(
      join(assets, "snapshot"),
      "2026-07-26T12:00:00.000Z",
      progressExport("attempt", "session")
    );
    const result = await extractLatestTacticalProfileProgress({
      containerPath: container,
      outputPath: output
    });
    assert.equal(result.attemptCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses ambiguous latest snapshots and containers without progress", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactical-ambiguous-extract-"));
  const container = join(directory, "com.chessticize.mobile");
  const assets = join(container, "Library", "Caches", "CloudKit", "id", "Assets");
  try {
    await mkdir(assets, { recursive: true });
    await writeSnapshot(
      join(assets, "one"),
      "2026-07-26T12:00:00.000Z",
      progressExport("attempt-one", "session-one")
    );
    await writeSnapshot(
      join(assets, "two"),
      "2026-07-26T12:00:00.000Z",
      progressExport("attempt-two", "session-two")
    );
    await assert.rejects(
      extractLatestTacticalProfileProgress({
        containerPath: container,
        outputPath: join(directory, "progress.json")
      }),
      /Multiple distinct progress snapshots share the latest updatedAt/
    );

    await rm(assets, { recursive: true, force: true });
    await mkdir(assets, { recursive: true });
    const invalidProgress = progressExport("invalid-attempt", "invalid-session");
    invalidProgress.settings = [];
    await writeSnapshot(
      join(assets, "invalid"),
      "2026-07-26T12:00:00.000Z",
      invalidProgress
    );
    await assert.rejects(
      extractLatestTacticalProfileProgress({
        containerPath: container,
        outputPath: join(directory, "progress.json")
      }),
      /No canonical LocalDataExport snapshot/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function progressExport(attemptId, sessionId) {
  return {
    schemaVersion: 1,
    settings: {
      sync: { iCloudEnabled: true },
      notifications: { reviewReminder: { mode: "smart" } },
      moveFeedback: { soundEnabled: true, hapticsEnabled: true },
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        focusedRunSeen: true
      }
    },
    ratings: [],
    attempts: [{ id: attemptId }],
    reviewQueue: [],
    reviewRemovals: [],
    sprintSessions: [{ id: sessionId }],
    practiceRuns: []
  };
}

function writeSnapshot(path, updatedAt, data) {
  return writeFile(path, JSON.stringify({
    schemaVersion: 1,
    deviceId: "private-device",
    updatedAt,
    data
  }));
}
