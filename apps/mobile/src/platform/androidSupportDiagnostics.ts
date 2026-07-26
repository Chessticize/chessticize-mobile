// Android platform adapter; kept outside the backend/domain seam.
import { NativeModules } from "react-native";
import {
  normalizePreparedSupportBundle,
  type ICloudSyncDiagnosticsClient,
  type NativePreparedSupportBundle,
  type SupportDiagnosticMetadata
} from "./iCloudSyncDiagnostics.ts";

type NativeSupportBundleWorkspace = {
  databaseSnapshotPath?: unknown;
  workspaceUrl?: unknown;
};

type NativeAndroidSupportDiagnosticsModule = {
  copyText?: (text: string) => Promise<unknown> | unknown;
  createSupportBundleWorkspace?: (
    diagnosticText: string
  ) => Promise<NativeSupportBundleWorkspace>;
  discardSupportBundle?: (bundleUrl: string) => Promise<unknown>;
  discardSupportBundleWorkspace?: (workspaceUrl: string) => Promise<unknown>;
  finishSupportBundle?: (
    workspaceUrl: string,
    metadata: SupportDiagnosticMetadata
  ) => Promise<NativePreparedSupportBundle>;
  shareSupportBundle?: (bundleUrl: string) => Promise<unknown>;
};

export function createNativeAndroidSupportDiagnosticsClient(
  databasePath: string | undefined
): ICloudSyncDiagnosticsClient | null {
  const nativeModule = NativeModules?.AndroidSupportDiagnostics as
    | NativeAndroidSupportDiagnosticsModule
    | undefined;
  if (
    !databasePath
    || !nativeModule
    || typeof nativeModule.copyText !== "function"
    || typeof nativeModule.createSupportBundleWorkspace !== "function"
    || typeof nativeModule.discardSupportBundle !== "function"
    || typeof nativeModule.discardSupportBundleWorkspace !== "function"
    || typeof nativeModule.finishSupportBundle !== "function"
    || typeof nativeModule.shareSupportBundle !== "function"
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
      const workspace = normalizeWorkspace(
        await nativeModule.createSupportBundleWorkspace?.(diagnosticText)
      );
      try {
        await createConsistentSQLiteSnapshot(
          databasePath,
          workspace.databaseSnapshotPath
        );
        return normalizePreparedSupportBundle(
          await nativeModule.finishSupportBundle?.(
            workspace.workspaceUrl,
            metadata
          )
        );
      } catch (error) {
        await nativeModule.discardSupportBundleWorkspace?.(
          workspace.workspaceUrl
        ).catch(() => {
          // The cache directory and native stale-artifact cleanup remain the
          // final boundary if best-effort workspace cleanup fails.
        });
        throw error;
      }
    },
    shareSupportBundle: async (bundleUrl) => {
      await nativeModule.shareSupportBundle?.(bundleUrl);
    }
  };
}

async function createConsistentSQLiteSnapshot(
  databasePath: string,
  destinationPath: string
): Promise<void> {
  const sourcePath = filePath(databasePath);
  const lastSlash = sourcePath.lastIndexOf("/");
  if (lastSlash < 0 || lastSlash === sourcePath.length - 1) {
    throw new Error("The local progress database path is invalid.");
  }

  // Keep the native SQLite package behind the Android-only execution path so
  // platform-capability tests can inspect composition without loading its
  // optional Node backend.
  const { open } = require("@op-engineering/op-sqlite") as
    typeof import("@op-engineering/op-sqlite");
  const database = open({
    location: sourcePath.slice(0, lastSlash),
    name: sourcePath.slice(lastSlash + 1),
    readOnly: true
  } as Parameters<typeof open>[0] & { readOnly: boolean });
  try {
    await database.execute("VACUUM INTO ?", [destinationPath]);
  } finally {
    await database.closeAsync();
  }
}

function filePath(input: string): string {
  if (!input.startsWith("file://")) {
    return input;
  }
  return decodeURIComponent(input.slice("file://".length));
}

function normalizeWorkspace(
  value: NativeSupportBundleWorkspace | undefined
): { databaseSnapshotPath: string; workspaceUrl: string } {
  if (
    !value
    || typeof value.databaseSnapshotPath !== "string"
    || typeof value.workspaceUrl !== "string"
  ) {
    throw new Error("The native support bundle workspace is invalid.");
  }
  return {
    databaseSnapshotPath: value.databaseSnapshotPath,
    workspaceUrl: value.workspaceUrl
  };
}
