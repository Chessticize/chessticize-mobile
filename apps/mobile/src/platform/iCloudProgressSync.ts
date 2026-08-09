// Mobile platform adapter; kept outside the backend/domain seam.
import { NativeModules } from "react-native";
import {
  FakeProgressV2Transport,
  ProgressV2ChangeTokenExpiredError,
  PROGRESS_V2_RECORD_TYPE,
  fingerprintOpaqueToken,
  type ProgressV1MetadataResult,
  type ProgressV2ChangePage,
  type ProgressV2ModifyResult,
  type ProgressV2Phase,
  type ProgressV2Record,
  type ProgressV2Transport
} from "../../../../packages/storage/src/progress-sync-v2.ts";
import type { ProgressSyncSnapshot } from "../../../../packages/storage/src/progress-sync.ts";
import { normalizeLegacyProgressSyncSnapshot } from "../../../../packages/storage/src/local-data-export-validation.ts";

export type ICloudAccountStatus =
  | "available"
  | "no_account"
  | "restricted"
  | "could_not_determine"
  | "unavailable";

export const PROGRESS_V2_RELEASE_PHASE: ProgressV2Phase = "sealed";

export function resolveProgressV2ActivePhase(
  persistedPhase: ProgressV2Phase
): ProgressV2Phase {
  return persistedPhase === "sealed" ? "sealed" : PROGRESS_V2_RELEASE_PHASE;
}

export interface ICloudProgressSyncClient extends ProgressV2Transport {
  getAccountStatus(): Promise<ICloudAccountStatus>;
  captureFullV2ZoneForSupport?(): Promise<NativeV2SupportCapture>;
}

export type ProgressV2SupportCapture = {
  formatVersion: 2;
  accountStatus: ICloudAccountStatus;
  v2: {
    status: "complete" | "not_initialized" | "unavailable";
    ndjson: string;
    ndjsonFileUrl?: string;
    recordCount: number;
    deletionCount: number;
    familyCounts: Record<string, number>;
    bytes: number;
    startedAt: string;
    completedAt: string;
    finalTokenFingerprint?: string;
    unavailableReason?: string;
  };
  v1: {
    status: "captured" | "missing" | "skipped_sealed" | "unavailable";
    snapshotJson?: string;
    unavailableReason?: string;
  };
};

export class ProgressV2ZoneNotInitializedError extends Error {
  constructor() {
    super("The CloudKit Progress V2 zone is not initialized");
    this.name = "ProgressV2ZoneNotInitializedError";
  }
}

const MAX_SUPPORT_CAPTURE_RECORDS = 250_000;
const MAX_SUPPORT_CAPTURE_BYTES = 256 * 1024 * 1024;

type NativeICloudProgressSyncModule = {
  getAccountStatus?: () => Promise<string>;
  ensureV2Zone?: () => Promise<unknown>;
  fetchV2Changes?: (previousToken: string | null) => Promise<NativeV2ChangePage>;
  captureV2ForSupport?: () => Promise<NativeV2SupportCapture>;
  modifyV2Records?: (
    saving: readonly ProgressV2Record[],
    deleting: readonly string[]
  ) => Promise<ProgressV2ModifyResult>;
  fetchV1Metadata?: () => Promise<ProgressV1MetadataResult>;
  fetchV1Snapshot?: (changeTag: string) => Promise<string | NativeSnapshotPayload>;
};

type NativeSnapshotPayload = {
  payload: string;
  changeTag?: string | null;
};

type NativeV2ChangePage = Omit<ProgressV2ChangePage, "nextToken"> & {
  nextToken: string;
};

type NativeV2SupportCapture = {
  status: "complete" | "not_initialized";
  ndjsonFileUrl?: string;
  recordCount: number;
  deletionCount: number;
  familyCounts: Record<string, number>;
  bytes: number;
  startedAt: string;
  completedAt: string;
  finalToken?: string;
};

export class FakeICloudProgressSyncClient
  extends FakeProgressV2Transport
  implements ICloudProgressSyncClient {
  private status: ICloudAccountStatus;

  constructor(
    options?: ConstructorParameters<typeof FakeProgressV2Transport>[0],
    status: ICloudAccountStatus = "available"
  ) {
    super(options);
    this.status = status;
  }

  async getAccountStatus(): Promise<ICloudAccountStatus> {
    return this.status;
  }

  setAccountStatus(status: ICloudAccountStatus): void {
    this.status = status;
  }
}

export function createNativeICloudProgressSyncClient(): ICloudProgressSyncClient | null {
  const nativeModule = NativeModules?.ICloudProgressSync as NativeICloudProgressSyncModule | undefined;
  if (
    !nativeModule ||
    typeof nativeModule.getAccountStatus !== "function" ||
    typeof nativeModule.ensureV2Zone !== "function" ||
    typeof nativeModule.fetchV2Changes !== "function" ||
    typeof nativeModule.modifyV2Records !== "function" ||
    typeof nativeModule.fetchV1Metadata !== "function" ||
    typeof nativeModule.fetchV1Snapshot !== "function"
  ) {
    return null;
  }

  const client: ICloudProgressSyncClient = {
    getAccountStatus: async () => normalizeICloudAccountStatus(await nativeModule.getAccountStatus?.()),
    ensureZone: async () => {
      await nativeModule.ensureV2Zone?.();
    },
    fetchZoneChanges: async (previousToken) => {
      try {
        const page = await nativeModule.fetchV2Changes?.(previousToken ?? null);
        if (!isNativeV2ChangePage(page)) {
          throw new Error("CloudKit returned an invalid Progress V2 change page");
        }
        return {
          records: page.records,
          deletedRecords: page.deletedRecords,
          nextToken: page.nextToken,
          moreComing: page.moreComing
        };
      } catch (error) {
        if (isNativeErrorCode(error, "icloud_change_token_expired")) {
          throw new ProgressV2ChangeTokenExpiredError();
        }
        if (isNativeErrorCode(error, "icloud_v2_zone_not_initialized")) {
          throw new ProgressV2ZoneNotInitializedError();
        }
        throw error;
      }
    },
    modifyRecords: async (input) => {
      const result = await nativeModule.modifyV2Records?.(input.saving, input.deleting);
      if (!isNativeModifyResult(result)) {
        throw new Error("CloudKit returned an invalid Progress V2 modify result");
      }
      return result;
    },
    fetchLegacyMetadata: async () => {
      const metadata = await nativeModule.fetchV1Metadata?.();
      if (!isLegacyMetadata(metadata)) {
        throw new Error("CloudKit returned invalid Progress V1 metadata");
      }
      return metadata;
    },
    fetchLegacySnapshot: async (changeTag) => {
      const result = await nativeModule.fetchV1Snapshot?.(changeTag);
      const payload = typeof result === "string" ? result : result?.payload;
      if (typeof payload !== "string") {
        throw new Error("CloudKit returned an invalid Progress V1 payload");
      }
      return parseProgressSyncSnapshot(payload);
    }
  };
  if (typeof nativeModule.captureV2ForSupport === "function") {
    client.captureFullV2ZoneForSupport = async () => {
      const capture = await nativeModule.captureV2ForSupport?.();
      if (!isNativeV2SupportCapture(capture)) {
        throw new Error("CloudKit returned an invalid Progress V2 support capture");
      }
      return capture;
    };
  }
  return client;
}

export async function captureProgressForSupport(
  client: ICloudProgressSyncClient,
  phase: "bridging" | "sealed"
): Promise<ProgressV2SupportCapture> {
  let accountStatus: ICloudAccountStatus;
  try {
    accountStatus = await client.getAccountStatus();
  } catch {
    accountStatus = "unavailable";
  }
  if (accountStatus !== "available") {
    const unavailableReason = accountStatus === "unavailable"
      ? "icloud_account_status_unavailable"
      : `icloud_account_${accountStatus}`;
    return {
      formatVersion: 2,
      accountStatus,
      v2: {
        status: "unavailable",
        ndjson: "",
        recordCount: 0,
        deletionCount: 0,
        familyCounts: {},
        bytes: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        unavailableReason
      },
      v1: phase === "sealed"
        ? { status: "skipped_sealed" }
        : { status: "unavailable", unavailableReason }
    };
  }

  const lines: string[] = [];
  const familyCounts: Record<string, number> = {};
  let recordCount = 0;
  let deletionCount = 0;
  let bytes = 0;
  let startedAt = new Date().toISOString();
  let completedAt = startedAt;
  let ndjsonFileUrl: string | undefined;
  let finalToken: string | undefined;
  let v2Status: ProgressV2SupportCapture["v2"]["status"] = "complete";
  let v2UnavailableReason: string | undefined;
  try {
    if (client.captureFullV2ZoneForSupport) {
      const nativeCapture = await client.captureFullV2ZoneForSupport();
      v2Status = nativeCapture.status;
      recordCount = nativeCapture.recordCount;
      deletionCount = nativeCapture.deletionCount;
      Object.assign(familyCounts, nativeCapture.familyCounts);
      bytes = nativeCapture.bytes;
      startedAt = nativeCapture.startedAt;
      completedAt = nativeCapture.completedAt;
      ndjsonFileUrl = nativeCapture.ndjsonFileUrl;
      finalToken = nativeCapture.finalToken;
    } else {
      let token: string | undefined;
      let moreComing = true;
      while (moreComing) {
        const page = await client.fetchZoneChanges(token);
        for (const record of page.records) {
          const line = JSON.stringify({
            changeType: "record",
            recordType: PROGRESS_V2_RECORD_TYPE,
            ...record
          });
          bytes += utf8ByteLength(line) + 1;
          lines.push(line);
          recordCount += 1;
          familyCounts[record.kind] = (familyCounts[record.kind] ?? 0) + 1;
        }
        for (const deleted of page.deletedRecords) {
          const line = JSON.stringify({
            changeType: "deleted",
            recordType: PROGRESS_V2_RECORD_TYPE,
            recordName: deleted.recordName
          });
          bytes += utf8ByteLength(line) + 1;
          lines.push(line);
          deletionCount += 1;
        }
        if (recordCount + deletionCount > MAX_SUPPORT_CAPTURE_RECORDS || bytes > MAX_SUPPORT_CAPTURE_BYTES) {
          throw new Error("Progress V2 support capture exceeds its safety limit");
        }
        token = page.nextToken;
        finalToken = page.nextToken;
        moreComing = page.moreComing;
      }
      completedAt = new Date().toISOString();
    }
  } catch (error) {
    lines.length = 0;
    recordCount = 0;
    deletionCount = 0;
    for (const key of Object.keys(familyCounts)) delete familyCounts[key];
    finalToken = undefined;
    ndjsonFileUrl = undefined;
    bytes = 0;
    completedAt = new Date().toISOString();
    if (error instanceof ProgressV2ZoneNotInitializedError) {
      v2Status = "not_initialized";
    } else {
      v2Status = "unavailable";
      v2UnavailableReason = boundedCaptureReason(error, "icloud_v2_capture_failed");
    }
  }

  let v1: ProgressV2SupportCapture["v1"];
  if (phase === "sealed") {
    v1 = { status: "skipped_sealed" };
  } else {
    try {
      const metadata = await client.fetchLegacyMetadata();
      if (metadata.status === "missing") {
        v1 = { status: "missing" };
      } else {
        const snapshot = await client.fetchLegacySnapshot(metadata.changeTag);
        const normalized = normalizeLegacyProgressSyncSnapshot(snapshot);
        if (!normalized) throw new Error("Progress V1 support snapshot is invalid");
        v1 = { status: "captured", snapshotJson: JSON.stringify(normalized) };
      }
    } catch (error) {
      v1 = {
        status: "unavailable",
        unavailableReason: boundedCaptureReason(error, "icloud_v1_capture_failed")
      };
    }
  }

  return {
    formatVersion: 2,
    accountStatus,
    v2: {
      status: v2Status,
      ndjson: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
      ...(ndjsonFileUrl === undefined ? {} : { ndjsonFileUrl }),
      recordCount,
      deletionCount,
      familyCounts,
      bytes,
      startedAt,
      completedAt,
      ...(finalToken === undefined ? {} : { finalTokenFingerprint: fingerprintOpaqueToken(finalToken) }),
      ...(v2UnavailableReason === undefined ? {} : { unavailableReason: v2UnavailableReason })
    },
    v1
  };
}

export function parseProgressSyncSnapshot(payload: string): ProgressSyncSnapshot {
  const parsed = JSON.parse(payload) as unknown;
  const normalized = normalizeLegacyProgressSyncSnapshot(parsed);
  if (!normalized) {
    throw new Error("iCloud progress snapshot payload is invalid");
  }
  return normalized;
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

function isNativeV2ChangePage(value: unknown): value is NativeV2ChangePage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<NativeV2ChangePage>;
  return Array.isArray(page.records) &&
    page.records.every(isProgressV2Record) &&
    Array.isArray(page.deletedRecords) &&
    page.deletedRecords.every((item) =>
      !!item && typeof item === "object" && typeof (item as { recordName?: unknown }).recordName === "string"
    ) &&
    typeof page.nextToken === "string" &&
    typeof page.moreComing === "boolean";
}

function isProgressV2Record(value: unknown): value is ProgressV2Record {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ProgressV2Record>;
  return typeof record.recordName === "string" &&
    typeof record.kind === "string" &&
    record.schemaVersion === 2 &&
    typeof record.payload === "string";
}

function isNativeModifyResult(value: unknown): value is ProgressV2ModifyResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ProgressV2ModifyResult>;
  return Array.isArray(result.savedRecordNames) &&
    result.savedRecordNames.every((item) => typeof item === "string") &&
    Array.isArray(result.deletedRecordNames) &&
    result.deletedRecordNames.every((item) => typeof item === "string") &&
    Array.isArray(result.errors);
}

function isNativeV2SupportCapture(value: unknown): value is NativeV2SupportCapture {
  if (!value || typeof value !== "object") return false;
  const capture = value as Partial<NativeV2SupportCapture>;
  return (capture.status === "complete" || capture.status === "not_initialized") &&
    (capture.ndjsonFileUrl === undefined || typeof capture.ndjsonFileUrl === "string") &&
    typeof capture.recordCount === "number" && capture.recordCount >= 0 &&
    typeof capture.deletionCount === "number" && capture.deletionCount >= 0 &&
    !!capture.familyCounts && typeof capture.familyCounts === "object" &&
    Object.values(capture.familyCounts).every((count) => typeof count === "number" && count >= 0) &&
    typeof capture.bytes === "number" && capture.bytes >= 0 &&
    typeof capture.startedAt === "string" &&
    typeof capture.completedAt === "string" &&
    (capture.finalToken === undefined || typeof capture.finalToken === "string") &&
    (capture.status !== "complete" ||
      (typeof capture.ndjsonFileUrl === "string" && typeof capture.finalToken === "string"));
}

function isLegacyMetadata(value: unknown): value is ProgressV1MetadataResult {
  return !!value && typeof value === "object" &&
    ((value as { status?: unknown }).status === "missing" ||
      ((value as { status?: unknown }).status === "available" &&
        typeof (value as { changeTag?: unknown }).changeTag === "string"));
}

function isNativeErrorCode(error: unknown, code: string): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === code;
}

function boundedCaptureReason(error: unknown, fallback: string): string {
  const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : fallback;
  return /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : fallback;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
