import { NativeModules } from "react-native";
import {
  createNativeICloudProgressSyncClient,
  FakeICloudProgressSyncClient,
  parseProgressSyncSnapshot
} from "../src/platform/iCloudProgressSync";
import type { ProgressSyncSnapshot } from "../../../packages/storage/src/progress-sync";
import { ProgressSyncConflictError } from "../../../packages/storage/src/progress-sync";

describe("iCloud progress sync bridge", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).ICloudProgressSync;
  });

  it("falls back when the native module is absent", () => {
    expect(createNativeICloudProgressSyncClient()).toBeNull();
  });

  it("wraps the native CloudKit module with JSON snapshot transport", async () => {
    const snapshot = sampleSnapshot();
    const saveSnapshot = jest.fn(async () => ({ saved: true, changeTag: "revision-2" }));
    (NativeModules as Record<string, unknown>).ICloudProgressSync = {
      getAccountStatus: jest.fn(async () => "available"),
      fetchSnapshot: jest.fn(async () => ({
        payload: JSON.stringify(snapshot),
        changeTag: "revision-1"
      })),
      saveSnapshot
    };

    const client = createNativeICloudProgressSyncClient();

    await expect(client?.getAccountStatus()).resolves.toBe("available");
    await expect(client?.fetchSnapshot()).resolves.toEqual(snapshot);
    await expect(client?.saveSnapshot(snapshot)).resolves.toBeUndefined();
    expect(saveSnapshot).toHaveBeenCalledWith(JSON.stringify(snapshot), "revision-1");
  });

  it("maps native CloudKit revision conflicts to a retryable sync conflict", async () => {
    const snapshot = sampleSnapshot();
    const conflict = Object.assign(new Error("server record changed"), {
      code: "icloud_save_conflict"
    });
    (NativeModules as Record<string, unknown>).ICloudProgressSync = {
      getAccountStatus: jest.fn(async () => "available"),
      fetchSnapshot: jest.fn(async () => ({
        payload: JSON.stringify(snapshot),
        changeTag: "revision-1"
      })),
      saveSnapshot: jest.fn(async () => Promise.reject(conflict))
    };
    const client = createNativeICloudProgressSyncClient();

    await client?.fetchSnapshot();

    await expect(client?.saveSnapshot(snapshot)).rejects.toBeInstanceOf(ProgressSyncConflictError);
  });

  it("normalizes unavailable status and treats empty native payloads as no snapshot", async () => {
    (NativeModules as Record<string, unknown>).ICloudProgressSync = {
      getAccountStatus: jest.fn(async () => "surprise"),
      fetchSnapshot: jest.fn(async () => null),
      saveSnapshot: jest.fn(async () => undefined)
    };

    const client = createNativeICloudProgressSyncClient();

    await expect(client?.getAccountStatus()).resolves.toBe("unavailable");
    await expect(client?.fetchSnapshot()).resolves.toBeUndefined();
  });

  it("rejects malformed snapshot payloads", () => {
    expect(() => parseProgressSyncSnapshot("{}")).toThrow(/invalid/);
  });

  it("keeps the fake client observable without native modules", async () => {
    const snapshot = sampleSnapshot();
    const client = new FakeICloudProgressSyncClient(undefined, "no_account");

    await expect(client.getAccountStatus()).resolves.toBe("no_account");
    await expect(client.fetchSnapshot()).resolves.toBeUndefined();
    await client.saveSnapshot(snapshot);
    await expect(client.fetchSnapshot()).resolves.toEqual(snapshot);
    expect(client.fetchCount).toBe(2);
    expect(client.saveCount).toBe(1);
    expect(client.savedSnapshots).toEqual([snapshot]);
  });
});

function sampleSnapshot(): ProgressSyncSnapshot {
  return {
    schemaVersion: 1,
    deviceId: "ios-test",
    updatedAt: "2026-07-07T00:00:00.000Z",
    data: {
      schemaVersion: 1,
      settings: {
        sync: {
          iCloudEnabled: true
        },
        notifications: {
          reviewReminder: {
            mode: "smart"
          }
        }
      },
      ratings: [],
      attempts: [],
      reviewQueue: [],
      sprintSessions: []
    }
  };
}
