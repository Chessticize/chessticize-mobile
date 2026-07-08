import { NativeModules } from "react-native";
import type {
  ProgressSyncSnapshot,
  ProgressSyncTransport
} from "../../../../packages/storage/src/progress-sync.ts";

export type ICloudAccountStatus =
  | "available"
  | "no_account"
  | "restricted"
  | "could_not_determine"
  | "unavailable";

export interface ICloudProgressSyncClient extends ProgressSyncTransport {
  getAccountStatus(): Promise<ICloudAccountStatus>;
}

type NativeICloudProgressSyncModule = {
  getAccountStatus?: () => Promise<string>;
  fetchSnapshot?: () => Promise<string | null | undefined>;
  saveSnapshot?: (payload: string) => Promise<unknown>;
};

export class FakeICloudProgressSyncClient implements ICloudProgressSyncClient {
  fetchCount = 0;
  saveCount = 0;
  savedSnapshots: ProgressSyncSnapshot[] = [];
  private snapshot: ProgressSyncSnapshot | undefined;
  private status: ICloudAccountStatus;

  constructor(
    snapshot?: ProgressSyncSnapshot,
    status: ICloudAccountStatus = "available"
  ) {
    this.snapshot = snapshot;
    this.status = status;
  }

  async getAccountStatus(): Promise<ICloudAccountStatus> {
    return this.status;
  }

  async fetchSnapshot(): Promise<ProgressSyncSnapshot | undefined> {
    this.fetchCount += 1;
    return this.snapshot;
  }

  async saveSnapshot(snapshot: ProgressSyncSnapshot): Promise<void> {
    this.saveCount += 1;
    this.snapshot = snapshot;
    this.savedSnapshots.push(snapshot);
  }

  setAccountStatus(status: ICloudAccountStatus): void {
    this.status = status;
  }

  setSnapshot(snapshot: ProgressSyncSnapshot | undefined): void {
    this.snapshot = snapshot;
  }
}

export function createNativeICloudProgressSyncClient(): ICloudProgressSyncClient | null {
  const nativeModule = NativeModules?.ICloudProgressSync as NativeICloudProgressSyncModule | undefined;
  if (
    !nativeModule ||
    typeof nativeModule.getAccountStatus !== "function" ||
    typeof nativeModule.fetchSnapshot !== "function" ||
    typeof nativeModule.saveSnapshot !== "function"
  ) {
    return null;
  }

  return {
    getAccountStatus: async () => normalizeICloudAccountStatus(await nativeModule.getAccountStatus?.()),
    fetchSnapshot: async () => {
      const payload = await nativeModule.fetchSnapshot?.();
      if (typeof payload !== "string" || payload.length === 0) {
        return undefined;
      }
      return parseProgressSyncSnapshot(payload);
    },
    saveSnapshot: async (snapshot) => {
      await nativeModule.saveSnapshot?.(JSON.stringify(snapshot));
    }
  };
}

export function parseProgressSyncSnapshot(payload: string): ProgressSyncSnapshot {
  const parsed = JSON.parse(payload) as unknown;
  if (!isProgressSyncSnapshot(parsed)) {
    throw new Error("iCloud progress snapshot payload is invalid");
  }
  return parsed;
}

function normalizeICloudAccountStatus(status: unknown): ICloudAccountStatus {
  switch (status) {
    case "available":
    case "no_account":
    case "restricted":
    case "could_not_determine":
    case "unavailable":
      return status;
    default:
      return "unavailable";
  }
}

function isProgressSyncSnapshot(value: unknown): value is ProgressSyncSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snapshot = value as Partial<ProgressSyncSnapshot>;
  return snapshot.schemaVersion === 1 &&
    typeof snapshot.deviceId === "string" &&
    typeof snapshot.updatedAt === "string" &&
    !!snapshot.data &&
    snapshot.data.schemaVersion === 1 &&
    Array.isArray(snapshot.data.ratings) &&
    Array.isArray(snapshot.data.attempts) &&
    Array.isArray(snapshot.data.reviewQueue) &&
    Array.isArray(snapshot.data.sprintSessions);
}
