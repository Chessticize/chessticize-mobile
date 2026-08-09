import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  inspectICloudSupportBundle,
  readStoredZipEntries,
  withICloudSupportBundle
} from "./lib/icloud-support-bundle.mjs";

test("support harness reopens SQLite and inspects CloudKit JSON without mutating either", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-fixture-"));
  try {
    const fixture = await createSupportFixture(directory);
    const databaseBefore = sha256(await readFile(fixture.databasePath));
    const cloudBefore = sha256(await readFile(fixture.cloudPath));

    const report = await inspectICloudSupportBundle(directory);
    const imported = await withICloudSupportBundle(directory, async ({
      cloudSnapshot,
      localDatabasePath
    }) => {
      const database = new DatabaseSync(localDatabasePath, { readOnly: true });
      try {
        return {
          attempts: cloudSnapshot.data.attempts.length,
          localRows: database.prepare("SELECT COUNT(*) AS count FROM attempts").get().count
        };
      } finally {
        database.close();
      }
    });

    assert.deepEqual(report.localDatabase, {
      integrityCheck: "ok",
      openedReadOnly: true,
      userVersion: 7,
      tables: ["attempts"]
    });
    assert.deepEqual(report.cloudSnapshot.counts, {
      ratings: 0,
      attempts: 1,
      reviewQueue: 0,
      sprintSessions: 0,
      practiceRuns: 0
    });
    assert.deepEqual(imported, { attempts: 1, localRows: 1 });
    assert.equal(sha256(await readFile(fixture.databasePath)), databaseBefore);
    assert.equal(sha256(await readFile(fixture.cloudPath)), cloudBefore);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness reads the app's uncompressed ZIP format and verifies checksums", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-zip-"));
  try {
    const fixture = await createSupportFixture(directory);
    const entryNames = [
      "local-progress.sqlite",
      "icloud-progress-snapshot.json",
      "diagnostic.txt",
      "manifest.json"
    ];
    const entries = new Map();
    for (const name of entryNames) {
      entries.set(name, await readFile(join(directory, name)));
    }
    const archivePath = join(directory, "Chessticize-Support-fixture.zip");
    await writeFile(archivePath, createStoredZip(entries));

    const report = await inspectICloudSupportBundle(archivePath);

    assert.equal(report.kind, "complete");
    assert.equal(report.localDatabase.integrityCheck, "ok");
    assert.equal(report.cloudSnapshot.available, true);
    assert.equal(fixture.manifest.files.length, 3);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness rejects a bundle whose manifest does not match its files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-invalid-"));
  try {
    const fixture = await createSupportFixture(directory);
    await writeFile(fixture.cloudPath, "{\"schemaVersion\":1}\n");

    await assert.rejects(
      inspectICloudSupportBundle(directory),
      /manifest verification failed for icloud-progress-snapshot\.json/
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness validates every V2 family, tombstones, and sealed V1 omission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-v2-"));
  try {
    const fixture = await createV2SupportFixture(directory);

    const report = await inspectICloudSupportBundle(directory);
    const replay = await withICloudSupportBundle(directory, async ({ cloudProgress }) => ({
      changes: cloudProgress.v2.changes.length,
      v1Status: cloudProgress.v1.status
    }));

    assert.equal(report.bundleFormatVersion, 2);
    assert.deepEqual(report.cloudProgress.v2, {
      status: "complete",
      captureStartedAt: "2026-08-09T19:59:58.000Z",
      captureCompletedAt: "2026-08-09T20:00:00.000Z",
      bytes: fixture.cloudBytes,
      recordCount: 7,
      deletionCount: 1,
      familyCounts: {
        attempt: 1,
        manifest: 1,
        practice_run: 1,
        preferences: 1,
        rating: 1,
        review_schedule: 1,
        sprint_session: 1
      },
      finalTokenFingerprint: "0123456789abcdef"
    });
    assert.deepEqual(report.cloudProgress.v1, { status: "skipped_sealed" });
    assert.deepEqual(replay, { changes: 8, v1Status: "skipped_sealed" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness rejects V2 NDJSON without the deployed record type", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-v2-record-type-"));
  try {
    const fixture = await createV2SupportFixture(directory);
    const lines = (await readFile(fixture.cloudPath, "utf8")).trim().split("\n");
    const first = JSON.parse(lines[0]);
    delete first.recordType;
    lines[0] = JSON.stringify(first);
    await rewriteV2Fixture(fixture, lines);

    await assert.rejects(
      inspectICloudSupportBundle(directory),
      /invalid record type/
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness rejects archives above the entry-count safety limit", () => {
  const archive = createStoredZip(new Map([["diagnostic.txt", Buffer.from("safe")]]));
  archive.writeUInt16LE(17, archive.length - 22 + 8);
  archive.writeUInt16LE(17, archive.length - 22 + 10);

  assert.throws(
    () => readStoredZipEntries(archive),
    /invalid or unsupported/
  );
});

test("support harness removes its extracted SQLite copy when replay fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-cleanup-"));
  let extractedDatabasePath;
  try {
    await createSupportFixture(directory);
    const entries = new Map();
    for (const name of [
      "local-progress.sqlite",
      "icloud-progress-snapshot.json",
      "diagnostic.txt",
      "manifest.json"
    ]) {
      entries.set(name, await readFile(join(directory, name)));
    }
    const archivePath = join(directory, "Chessticize-Support-cleanup.zip");
    await writeFile(archivePath, createStoredZip(entries));

    await assert.rejects(
      withICloudSupportBundle(archivePath, async ({ localDatabasePath }) => {
        extractedDatabasePath = localDatabasePath;
        throw new Error("fixture replay failed");
      }),
      /fixture replay failed/
    );
    await assert.rejects(stat(extractedDatabasePath), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("support harness rejects V2 NDJSON whose payload identity is corrupt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-support-v2-corrupt-"));
  try {
    const fixture = await createV2SupportFixture(directory);
    const lines = (await readFile(fixture.cloudPath, "utf8")).trim().split("\n");
    const first = JSON.parse(lines[0]);
    first.payload = JSON.stringify({
      formatVersion: 2,
      kind: "attempt",
      entityKey: "different-id",
      state: "present",
      value: { id: "attempt-1" }
    });
    lines[0] = JSON.stringify(first);
    await writeFile(fixture.cloudPath, `${lines.join("\n")}\n`);
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const cloudFile = manifest.files.find((file) => file.name === "icloud-progress-v2.ndjson");
    const contents = await readFile(fixture.cloudPath);
    cloudFile.bytes = contents.length;
    cloudFile.sha256 = sha256(contents);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));

    await assert.rejects(
      inspectICloudSupportBundle(directory),
      /Progress V2 payload on line 1 is invalid/
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

async function createSupportFixture(directory) {
  const databasePath = join(directory, "local-progress.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(
    "PRAGMA user_version = 7;"
    + "CREATE TABLE attempts (id TEXT PRIMARY KEY, result TEXT NOT NULL);"
    + "INSERT INTO attempts VALUES ('attempt-1', 'correct');"
  );
  database.close();

  const cloudPath = join(directory, "icloud-progress-snapshot.json");
  await writeFile(cloudPath, JSON.stringify({
    schemaVersion: 1,
    deviceId: "app-generated-fixture-id",
    updatedAt: "2026-07-26T20:00:00.000Z",
    data: {
      schemaVersion: 1,
      settings: { sync: { iCloudEnabled: true } },
      ratings: [],
      attempts: [{ id: "remote-attempt" }],
      reviewQueue: [],
      sprintSessions: []
    }
  }));
  await writeFile(
    join(directory, "diagnostic.txt"),
    "Chessticize Support Diagnostic\nCode: icloud_fetch_failed\n"
  );
  const fileNames = [
    "local-progress.sqlite",
    "icloud-progress-snapshot.json",
    "diagnostic.txt"
  ];
  const files = [];
  for (const name of fileNames) {
    const contents = await readFile(join(directory, name));
    files.push({
      name,
      bytes: contents.length,
      sha256: sha256(contents)
    });
  }
  const manifest = {
    bundleFormatVersion: 1,
    createdAt: "2026-07-26T20:00:00.000Z",
    kind: "complete",
    app: { bundleIdentifier: "com.chessticize.mobile", version: "1.2.3", build: "45" },
    sync: {
      enabled: true,
      latestStatus: "iCloud sync failed",
      accountStatusAtExport: "available",
      containerIdentifier: "iCloud.com.chessticize.mobile"
    },
    environment: {
      platform: "iOS",
      operatingSystemVersion: "26.0",
      deviceFamily: "iPhone"
    },
    localDatabase: {
      capturedWith: "sqlite3_backup",
      healthAvailable: true,
      integrityCheckPassed: true,
      integrityCheck: "ok",
      userVersion: 7
    },
    cloudSnapshot: { available: true, unavailableReason: null },
    files,
    privacy: {
      appleIdIncluded: false,
      credentialsIncluded: false,
      hardwareIdentifiersIncluded: false,
      appGeneratedSyncIdMayBeIncluded: true
    }
  };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return { cloudPath, databasePath, manifest };
}

async function createV2SupportFixture(directory) {
  const databasePath = join(directory, "local-progress.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(
    "PRAGMA user_version = 20;"
    + "CREATE TABLE attempts (id TEXT PRIMARY KEY, result TEXT NOT NULL);"
  );
  database.close();
  await writeFile(join(directory, "diagnostic.txt"), "V2 migration phase: sealed\n");

  const record = (kind, entityKey, value) => ({
    changeType: "record",
    recordType: "ProgressV2Record",
    recordName: `v2|${kind}|${encodeURIComponent(entityKey)}`,
    kind,
    schemaVersion: 2,
    payload: JSON.stringify({
      formatVersion: 2,
      kind,
      entityKey,
      state: "present",
      value
    })
  });
  const changes = [
    record("attempt", "attempt-1", { id: "attempt-1" }),
    record("manifest", "default", {
      phase: "sealed",
      migrationStartedAt: "2026-08-01T00:00:00.000Z",
      minimumWriterVersion: "1.4-v2",
      sealedAt: "2026-08-09T00:00:00.000Z"
    }),
    record("practice_run", "run-1", { id: "run-1" }),
    record("preferences", "default", { moveFeedback: {}, notifications: {} }),
    record("rating", "puzzle\u001f0", { key: "puzzle", generation: 0 }),
    {
      changeType: "record",
      recordType: "ProgressV2Record",
      recordName: "v2|review_schedule|puzzle-old",
      kind: "review_schedule",
      schemaVersion: 2,
      payload: JSON.stringify({
        formatVersion: 2,
        kind: "review_schedule",
        entityKey: "puzzle-old",
        state: "deleted",
        deletedAt: "2026-08-08T00:00:00.000Z"
      })
    },
    record("sprint_session", "session-1", { id: "session-1" }),
    {
      changeType: "deleted",
      recordType: "ProgressV2Record",
      recordName: "v2|attempt|attempt-old"
    }
  ];
  const cloudPath = join(directory, "icloud-progress-v2.ndjson");
  await writeFile(cloudPath, `${changes.map((change) => JSON.stringify(change)).join("\n")}\n`);
  const cloudBytes = (await readFile(cloudPath)).length;

  const fileNames = ["local-progress.sqlite", "diagnostic.txt", "icloud-progress-v2.ndjson"];
  const files = [];
  for (const name of fileNames) {
    const contents = await readFile(join(directory, name));
    files.push({ name, bytes: contents.length, sha256: sha256(contents) });
  }
  const manifest = {
    bundleFormatVersion: 2,
    createdAt: "2026-08-09T20:00:00.000Z",
    kind: "complete",
    app: { bundleIdentifier: "com.chessticize.mobile", version: "1.4.0", build: "50" },
    sync: {
      enabled: true,
      latestStatus: "Synced",
      activeFormat: "v2",
      accountStatusAtExport: "available",
      containerIdentifier: "iCloud.com.chessticize.mobile",
      progressV2: {
        phase: "sealed",
        zoneInitializedLocally: true,
        pendingOutboxCount: 0,
        serverChangeTokenFingerprint: "fedcba9876543210",
        legacyImportPending: false
      }
    },
    environment: { platform: "iOS", operatingSystemVersion: "26.0", deviceFamily: "iPhone" },
    localDatabase: {
      capturedWith: "sqlite3_backup",
      healthAvailable: true,
      integrityCheckPassed: true,
      integrityCheck: "ok",
      userVersion: 20
    },
    cloudProgress: {
      complete: true,
      unavailableReason: null,
      v2: {
        status: "complete",
        captureStartedAt: "2026-08-09T19:59:58.000Z",
        captureCompletedAt: "2026-08-09T20:00:00.000Z",
        bytes: cloudBytes,
        recordCount: 7,
        deletionCount: 1,
        familyCounts: {
          attempt: 1,
          manifest: 1,
          practice_run: 1,
          preferences: 1,
          rating: 1,
          review_schedule: 1,
          sprint_session: 1
        },
        finalTokenFingerprint: "0123456789abcdef"
      },
      v1: { status: "skipped_sealed" }
    },
    files,
    privacy: {
      appleIdIncluded: false,
      credentialsIncluded: false,
      hardwareIdentifiersIncluded: false,
      appGeneratedSyncIdMayBeIncluded: true
    }
  };
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { cloudBytes, cloudPath, databasePath, manifestPath };
}

async function rewriteV2Fixture(fixture, lines) {
  await writeFile(fixture.cloudPath, `${lines.join("\n")}\n`);
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  const cloudFile = manifest.files.find((file) => file.name === "icloud-progress-v2.ndjson");
  const contents = await readFile(fixture.cloudPath);
  cloudFile.bytes = contents.length;
  cloudFile.sha256 = sha256(contents);
  manifest.cloudProgress.v2.bytes = contents.length;
  await writeFile(fixture.manifestPath, JSON.stringify(manifest));
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameData = Buffer.from(name, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameData.length, 26);
    localParts.push(localHeader, nameData, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameData.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameData);
    offset += localHeader.length + nameData.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
