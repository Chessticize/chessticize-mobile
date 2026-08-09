import { NativeModules } from "react-native";
import {
  createNativeICloudProgressSyncClient,
  FakeICloudProgressSyncClient,
  PROGRESS_V2_RELEASE_PHASE,
  ProgressV2ZoneNotInitializedError,
  captureProgressForSupport,
  parseProgressSyncSnapshot,
  resolveProgressV2ActivePhase
} from "../src/platform/iCloudProgressSync";
import {
  PROGRESS_V2_FORMAT_VERSION,
  ProgressV2ChangeTokenExpiredError,
  canonicalJson,
  progressV2RecordName,
  type ProgressV2Record
} from "../../../packages/storage/src/progress-sync-v2";
import type { ProgressSyncSnapshot } from "../../../packages/storage/src/progress-sync";

describe("iCloud progress V2 bridge", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).ICloudProgressSync;
  });

  it("pins the 1.4.2 release policy to a monotonic sealed phase", () => {
    expect(PROGRESS_V2_RELEASE_PHASE).toBe("sealed");
    expect(resolveProgressV2ActivePhase("bridging")).toBe("sealed");
    expect(resolveProgressV2ActivePhase("sealed")).toBe("sealed");
  });

  it("falls back when the complete V2 native module is absent", () => {
    expect(createNativeICloudProgressSyncClient()).toBeNull();
    (NativeModules as Record<string, unknown>).ICloudProgressSync = {
      getAccountStatus: jest.fn(async () => "available"),
      ensureV2Zone: jest.fn(async () => undefined)
    };
    expect(createNativeICloudProgressSyncClient()).toBeNull();
  });

  it("wraps zone changes, record batches, and read-only V1 bridge calls", async () => {
    const record = sampleV2Record();
    const modifyV2Records = jest.fn(async () => ({
      savedRecordNames: [record.recordName],
      deletedRecordNames: [],
      errors: []
    }));
    const fetchV1Snapshot = jest.fn(async () => ({
      payload: JSON.stringify(sampleSnapshot()),
      changeTag: "legacy-1"
    }));
    (NativeModules as Record<string, unknown>).ICloudProgressSync = {
      getAccountStatus: jest.fn(async () => "available"),
      ensureV2Zone: jest.fn(async () => ({ created: true })),
      fetchV2Changes: jest.fn(async () => ({
        records: [record],
        deletedRecords: [],
        nextToken: "token-1",
        moreComing: false
      })),
      modifyV2Records,
      fetchV1Metadata: jest.fn(async () => ({ status: "available", changeTag: "legacy-1" })),
      fetchV1Snapshot
    };

    const client = createNativeICloudProgressSyncClient();
    await expect(client?.getAccountStatus()).resolves.toBe("available");
    await expect(client?.ensureZone()).resolves.toBeUndefined();
    await expect(client?.fetchZoneChanges()).resolves.toEqual({
      records: [record],
      deletedRecords: [],
      nextToken: "token-1",
      moreComing: false
    });
    await expect(client?.modifyRecords({ saving: [record], deleting: [] })).resolves.toEqual({
      savedRecordNames: [record.recordName],
      deletedRecordNames: [],
      errors: []
    });
    await expect(client?.fetchLegacyMetadata()).resolves.toEqual({
      status: "available",
      changeTag: "legacy-1"
    });
    await expect(client?.fetchLegacySnapshot("legacy-1")).resolves.toEqual(sampleSnapshot());
    expect(modifyV2Records).toHaveBeenCalledWith([record], []);
    expect(fetchV1Snapshot).toHaveBeenCalledWith("legacy-1");
    expect("saveSnapshot" in (client ?? {})).toBe(false);
  });

  it("maps a native expired-token result to the coordinator rebuild signal", async () => {
    const expired = Object.assign(new Error("expired"), { code: "icloud_change_token_expired" });
    (NativeModules as Record<string, unknown>).ICloudProgressSync = completeNativeModule({
      fetchV2Changes: jest.fn(async () => Promise.reject(expired))
    });
    const client = createNativeICloudProgressSyncClient();
    await expect(client?.fetchZoneChanges("old-token")).rejects.toBeInstanceOf(
      ProgressV2ChangeTokenExpiredError
    );
  });

  it("normalizes unknown account status and rejects malformed V2 pages", async () => {
    (NativeModules as Record<string, unknown>).ICloudProgressSync = completeNativeModule({
      getAccountStatus: jest.fn(async () => "surprise"),
      fetchV2Changes: jest.fn(async () => ({ records: [], deletedRecords: [] }))
    });
    const client = createNativeICloudProgressSyncClient();
    await expect(client?.getAccountStatus()).resolves.toBe("unavailable");
    await expect(client?.fetchZoneChanges()).rejects.toThrow(/invalid Progress V2 change page/);
  });

  it("validates legacy snapshots before they enter the storage boundary", () => {
    expect(() => parseProgressSyncSnapshot("{}")).toThrow(/invalid/);
    expect(parseProgressSyncSnapshot(JSON.stringify(sampleSnapshot()))).toEqual(sampleSnapshot());
  });

  it("keeps the maintained fake observable without native modules", async () => {
    const client = new FakeICloudProgressSyncClient({ legacy: "missing" }, "no_account");
    const record = sampleV2Record();
    await expect(client.getAccountStatus()).resolves.toBe("no_account");
    await client.ensureZone();
    await client.modifyRecords({ saving: [record], deleting: [] });
    await expect(client.fetchZoneChanges()).resolves.toMatchObject({
      records: [record],
      moreComing: false
    });
    expect(client.records).toEqual([record]);
    expect(client.legacyWriteCount).toBe(0);
  });

  it("captures a complete V2 zone from a nil token into one NDJSON payload", async () => {
    const client = new FakeICloudProgressSyncClient({
      legacy: { changeTag: "legacy-1", snapshot: sampleSnapshot() }
    });
    const record = sampleV2Record();
    await client.modifyRecords({ saving: [record], deleting: [] });

    const capture = await captureProgressForSupport(client, "bridging");

    expect(capture.accountStatus).toBe("available");
    expect(capture.v2.status).toBe("complete");
    expect(capture.v2.recordCount).toBe(1);
    expect(capture.v2.familyCounts).toEqual({ manifest: 1 });
    expect(capture.v2.finalTokenFingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(capture.v2.ndjson.trim().split("\n").map((line) => JSON.parse(line)))
      .toEqual([{
        changeType: "record",
        recordType: "ProgressV2Record",
        ...record
      }]);
    expect(capture.v1.status).toBe("captured");
    expect(client.legacyMetadataFetchCount).toBe(1);
    expect(client.legacySnapshotFetchCount).toBe(1);
    expect(client.zoneInitializationCount).toBe(0);
  });

  it("keeps a missing V2 zone normal and never reads V1 after seal", async () => {
    const client = new FakeICloudProgressSyncClient({
      legacy: { changeTag: "must-not-read", snapshot: sampleSnapshot() }
    });
    client.fetchZoneChanges = jest.fn(async () => {
      throw new ProgressV2ZoneNotInitializedError();
    });

    const capture = await captureProgressForSupport(client, "sealed");

    expect(capture.v2).toMatchObject({
      status: "not_initialized",
      ndjson: "",
      recordCount: 0,
      deletionCount: 0
    });
    expect(capture.v1.status).toBe("skipped_sealed");
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);
  });

  it("does not query either cloud format when the iCloud account is unavailable", async () => {
    const client = new FakeICloudProgressSyncClient({
      legacy: { changeTag: "must-not-read", snapshot: sampleSnapshot() }
    }, "no_account");

    const capture = await captureProgressForSupport(client, "bridging");

    expect(capture).toMatchObject({
      accountStatus: "no_account",
      v2: { status: "unavailable", unavailableReason: "icloud_account_no_account" },
      v1: { status: "unavailable", unavailableReason: "icloud_account_no_account" }
    });
    expect(client.zoneChangeFetchCount).toBe(0);
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);
  });

  it("uses the native streaming V2 capture without materializing zone pages in JS", async () => {
    const fetchV2Changes = jest.fn();
    const captureV2ForSupport = jest.fn(async () => ({
      status: "complete",
      ndjsonFileUrl: "file:///tmp/chessticize-progress-v2-capture-test.ndjson",
      recordCount: 240_000,
      deletionCount: 3,
      familyCounts: { attempt: 239_999, manifest: 1 },
      bytes: 120_000_000,
      startedAt: "2026-08-09T12:00:00.000Z",
      completedAt: "2026-08-09T12:00:10.000Z",
      finalToken: "native-final-token"
    }));
    (NativeModules as Record<string, unknown>).ICloudProgressSync = completeNativeModule({
      fetchV2Changes,
      captureV2ForSupport
    });
    const client = createNativeICloudProgressSyncClient();

    const capture = await captureProgressForSupport(client!, "sealed");

    expect(capture.v2).toMatchObject({
      status: "complete",
      ndjson: "",
      ndjsonFileUrl: "file:///tmp/chessticize-progress-v2-capture-test.ndjson",
      recordCount: 240_000,
      deletionCount: 3,
      bytes: 120_000_000,
      startedAt: "2026-08-09T12:00:00.000Z",
      completedAt: "2026-08-09T12:00:10.000Z"
    });
    expect(capture.v2.finalTokenFingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(capture.v1.status).toBe("skipped_sealed");
    expect(captureV2ForSupport).toHaveBeenCalledTimes(1);
    expect(fetchV2Changes).not.toHaveBeenCalled();
  });

  it("never labels a partially fetched V2 diagnosis capture as complete", async () => {
    const client = new FakeICloudProgressSyncClient({ legacy: "missing" });
    const record = sampleV2Record();
    client.fetchZoneChanges = jest.fn()
      .mockResolvedValueOnce({
        records: [record],
        deletedRecords: [],
        nextToken: "page-1",
        moreComing: true
      })
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), {
        code: "icloud_v2_fetch_changes_failed"
      }));

    const capture = await captureProgressForSupport(client, "bridging");

    expect(capture.v2).toMatchObject({
      status: "unavailable",
      ndjson: "",
      recordCount: 0,
      deletionCount: 0,
      bytes: 0,
      unavailableReason: "icloud_v2_fetch_changes_failed"
    });
    expect(capture.v2.finalTokenFingerprint).toBeUndefined();
    expect(capture.v1.status).toBe("missing");
  });
});

function completeNativeModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    getAccountStatus: jest.fn(async () => "available"),
    ensureV2Zone: jest.fn(async () => undefined),
    fetchV2Changes: jest.fn(async () => ({
      records: [],
      deletedRecords: [],
      nextToken: "0",
      moreComing: false
    })),
    modifyV2Records: jest.fn(async () => ({
      savedRecordNames: [],
      deletedRecordNames: [],
      errors: []
    })),
    fetchV1Metadata: jest.fn(async () => ({ status: "missing" })),
    fetchV1Snapshot: jest.fn(async () => JSON.stringify(sampleSnapshot())),
    ...overrides
  };
}

function sampleV2Record(): ProgressV2Record {
  const identity = { kind: "manifest" as const, entityKey: "default" };
  return {
    recordName: progressV2RecordName(identity),
    kind: "manifest",
    schemaVersion: PROGRESS_V2_FORMAT_VERSION,
    payload: canonicalJson({
      formatVersion: PROGRESS_V2_FORMAT_VERSION,
      kind: "manifest",
      entityKey: "default",
      state: "present",
      value: {
        phase: "bridging",
        minimumWriterVersion: "1.4-v2",
        migrationStartedAt: "2026-08-09T00:00:00.000Z"
      }
    })
  };
}

function sampleSnapshot(): ProgressSyncSnapshot {
  return {
    schemaVersion: 1,
    deviceId: "ios-test",
    updatedAt: "2026-07-07T00:00:00.000Z",
    data: {
      schemaVersion: 1,
      settings: {
        arrowDuel: {
          opponentReplyEnabled: true
        },
        sync: { iCloudEnabled: true },
        notifications: { reviewReminder: { mode: "smart" } },
        moveFeedback: { soundEnabled: true, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: false,
          activeSessionSeen: false,
          arrowDuelSeen: false
        }
      },
      ratings: [],
      attempts: [],
      reviewQueue: [],
      reviewRemovals: [],
      sprintSessions: [],
      practiceRuns: []
    }
  };
}
