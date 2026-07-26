// Mobile platform adapter; kept outside the backend/domain seam.
import { NativeModules } from "react-native";
import type { ICloudAccountStatus } from "./iCloudProgressSync.ts";

export type ICloudSyncAttempt =
  | "App Background"
  | "Enabled in Settings"
  | "Manual"
  | "Startup";

export type ICloudSyncFailureDiagnostic = {
  attempt: ICloudSyncAttempt;
  code: string;
  domain: string;
  message: string;
  nativeCode?: string;
  occurredAt: string;
  phase: string;
  retryAfterSeconds?: number;
};

export type ICloudSyncDiagnosticMetadata = {
  appVersion: string;
  buildNumber?: string;
  iCloudAccountStatus: ICloudAccountStatus | "not_checked";
  iCloudSyncEnabled: boolean;
  latestSyncStatus: string;
};

export type PreparedICloudSyncSupportBundle = {
  bundleUrl: string;
  files: readonly string[];
  kind: "complete" | "partial";
  unavailableReason?: string;
};

export interface ICloudSyncDiagnosticsClient {
  copyText(text: string): Promise<void>;
  discardSupportBundle(bundleUrl: string): Promise<void>;
  prepareSupportBundle(input: {
    diagnosticText: string;
    metadata: ICloudSyncDiagnosticMetadata;
  }): Promise<PreparedICloudSyncSupportBundle>;
  shareSupportBundle(bundleUrl: string): Promise<void>;
}

type NativePreparedSupportBundle = {
  bundleUrl?: unknown;
  files?: unknown;
  kind?: unknown;
  unavailableReason?: unknown;
};

type NativeICloudSyncDiagnosticsModule = {
  copyText?: (text: string) => Promise<unknown> | unknown;
  discardSupportBundle?: (bundleUrl: string) => Promise<unknown>;
  prepareSupportBundle?: (
    databasePath: string,
    diagnosticText: string,
    metadata: ICloudSyncDiagnosticMetadata
  ) => Promise<NativePreparedSupportBundle>;
  shareSupportBundle?: (bundleUrl: string) => Promise<unknown>;
};

export function createNativeICloudSyncDiagnosticsClient(
  databasePath: string | undefined
): ICloudSyncDiagnosticsClient | null {
  const nativeModule = NativeModules?.ICloudSyncDiagnostics as
    | NativeICloudSyncDiagnosticsModule
    | undefined;
  if (
    !databasePath ||
    !nativeModule ||
    typeof nativeModule.copyText !== "function" ||
    typeof nativeModule.discardSupportBundle !== "function" ||
    typeof nativeModule.prepareSupportBundle !== "function" ||
    typeof nativeModule.shareSupportBundle !== "function"
  ) {
    return null;
  }

  return {
    copyText: async (text) => {
      await nativeModule.copyText?.(text);
    },
    discardSupportBundle: async (bundleUrl) => {
      await nativeModule.discardSupportBundle?.(bundleUrl);
    },
    prepareSupportBundle: async ({ diagnosticText, metadata }) => {
      const result = await nativeModule.prepareSupportBundle?.(
        databasePath,
        diagnosticText,
        metadata
      );
      return normalizePreparedSupportBundle(result);
    },
    shareSupportBundle: async (bundleUrl) => {
      await nativeModule.shareSupportBundle?.(bundleUrl);
    }
  };
}

export function captureICloudSyncFailure(
  error: unknown,
  input: {
    attempt: ICloudSyncAttempt;
    occurredAt: string;
  }
): ICloudSyncFailureDiagnostic {
  const record = objectRecord(error);
  const userInfo = objectRecord(record?.userInfo);
  const code = stringValue(record?.code) ?? "icloud_sync_failed";
  const nativeCode = numberOrStringValue(
    userInfo?.cloudKitCode ?? userInfo?.nativeErrorCode ?? userInfo?.CKErrorCode
  );
  const retryAfterSeconds = finiteNumber(
    userInfo?.CKErrorRetryAfterKey ?? userInfo?.retryAfter
  );

  return {
    attempt: input.attempt,
    code,
    domain: stringValue(record?.domain)
      ?? stringValue(userInfo?.nativeErrorDomain)
      ?? domainForCode(code),
    message: errorMessage(error),
    ...(nativeCode ? { nativeCode } : {}),
    occurredAt: input.occurredAt,
    phase: phaseForCode(code),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {})
  };
}

export function formatICloudSyncFailureDiagnostic(
  diagnostic: ICloudSyncFailureDiagnostic,
  metadata: Pick<ICloudSyncDiagnosticMetadata, "appVersion" | "buildNumber">
): string {
  return [
    "Chessticize iCloud Sync Diagnostic",
    `App: ${appVersionLabel(metadata)}`,
    `Failed at: ${diagnostic.occurredAt}`,
    `Sync attempt: ${diagnostic.attempt}`,
    `Phase: ${diagnostic.phase}`,
    `Code: ${diagnostic.code}`,
    ...(diagnostic.nativeCode ? [`Native code: ${diagnostic.nativeCode}`] : []),
    `Domain: ${diagnostic.domain}`,
    `Message: ${diagnostic.message}`,
    ...(diagnostic.retryAfterSeconds !== undefined
      ? [`Retry after: ${diagnostic.retryAfterSeconds} seconds`]
      : [])
  ].join("\n");
}

export function formatICloudSyncOverviewDiagnostic(
  metadata: ICloudSyncDiagnosticMetadata,
  createdAt: string,
  lastFailure?: ICloudSyncFailureDiagnostic
): string {
  return [
    "Chessticize Support Diagnostic",
    `App: ${appVersionLabel(metadata)}`,
    `Created at: ${createdAt}`,
    "Platform: iOS",
    `iCloud sync setting: ${metadata.iCloudSyncEnabled ? "On" : "Off"}`,
    `iCloud account status: ${metadata.iCloudAccountStatus}`,
    `Latest sync status: ${metadata.latestSyncStatus}`,
    ...(lastFailure
      ? [
          "",
          "Last sync failure captured in this app session:",
          formatICloudSyncFailureDiagnostic(lastFailure, metadata)
        ]
      : ["Last sync failure captured in this app session: none"])
  ].join("\n");
}

export function iCloudSyncAttemptLabel(reason: string): ICloudSyncAttempt {
  switch (reason) {
    case "startup":
      return "Startup";
    case "app-background":
      return "App Background";
    case "settings-enabled":
      return "Enabled in Settings";
    default:
      return "Manual";
  }
}

function normalizePreparedSupportBundle(
  value: NativePreparedSupportBundle | undefined
): PreparedICloudSyncSupportBundle {
  if (
    !value ||
    typeof value.bundleUrl !== "string" ||
    (value.kind !== "complete" && value.kind !== "partial") ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => typeof file === "string")
  ) {
    throw new Error("The native support bundle result is invalid.");
  }
  return {
    bundleUrl: value.bundleUrl,
    files: value.files,
    kind: value.kind,
    ...(typeof value.unavailableReason === "string"
      ? { unavailableReason: value.unavailableReason }
      : {})
  };
}

function phaseForCode(code: string): string {
  if (code.includes("account")) {
    return "Check iCloud Account";
  }
  if (code.includes("fetch") || code.includes("payload")) {
    return "Fetch from iCloud";
  }
  if (code.includes("save") || code.includes("conflict")) {
    return "Save to iCloud";
  }
  return "Merge Progress";
}

function domainForCode(code: string): string {
  return code.startsWith("icloud_") ? "CloudKit" : "Chessticize";
}

function appVersionLabel(
  metadata: Pick<ICloudSyncDiagnosticMetadata, "appVersion" | "buildNumber">
): string {
  return metadata.buildNumber
    ? `${metadata.appVersion} (${metadata.buildNumber})`
    : metadata.appVersion;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberOrStringValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return stringValue(value);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  const message = stringValue(objectRecord(error)?.message);
  return message ?? "Unknown iCloud sync error";
}
