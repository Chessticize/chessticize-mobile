import { open } from "@op-engineering/op-sqlite";
import { NativeModules } from "react-native";
import { createNativeAndroidSupportDiagnosticsClient } from "../src/platform/androidSupportDiagnostics";
import { formatAndroidSupportOverviewDiagnostic } from "../src/platform/iCloudSyncDiagnostics";

jest.mock("@op-engineering/op-sqlite", () => ({
  open: jest.fn()
}));

describe("Android support diagnostics bridge", () => {
  const execute = jest.fn(async () => ({ rows: [], rowsAffected: 0 }));
  const closeAsync = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (open as jest.Mock).mockReturnValue({ closeAsync, execute });
  });

  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).AndroidSupportDiagnostics;
  });

  it("falls back when the native module or persistent database path is absent", () => {
    expect(createNativeAndroidSupportDiagnosticsClient(undefined)).toBeNull();
    expect(createNativeAndroidSupportDiagnosticsClient("/progress.sqlite")).toBeNull();
  });

  it("creates a consistent SQLite snapshot before the native archive is finalized", async () => {
    const createSupportBundleWorkspace = jest.fn(async () => ({
      databaseSnapshotPath: "/cache/support-work/local-progress.sqlite",
      workspaceUrl: "file:///cache/support-work"
    }));
    const finishSupportBundle = jest.fn(async () => ({
      bundleUrl: "file:///cache/Chessticize-Support.zip",
      files: ["local-progress.sqlite", "diagnostic.txt", "manifest.json"],
      kind: "complete"
    }));
    const shareSupportBundle = jest.fn(async () => undefined);
    const discardSupportBundle = jest.fn(async () => undefined);
    const discardSupportBundleWorkspace = jest.fn(async () => undefined);
    (NativeModules as Record<string, unknown>).AndroidSupportDiagnostics = {
      copyText: jest.fn(async () => undefined),
      createSupportBundleWorkspace,
      discardSupportBundle,
      discardSupportBundleWorkspace,
      finishSupportBundle,
      shareSupportBundle
    };

    const client = createNativeAndroidSupportDiagnosticsClient(
      "/data/user/0/com.chessticize.mobile/databases/progress.sqlite"
    );
    const metadata = {
      appVersion: "1.2.3",
      buildNumber: "45",
      platform: "android" as const,
      progressProtection: "android_managed_backup" as const
    };
    const bundle = await client?.prepareSupportBundle({
      diagnosticText: "Android diagnostic",
      metadata
    });

    expect(open).toHaveBeenCalledWith({
      location: "/data/user/0/com.chessticize.mobile/databases",
      name: "progress.sqlite",
      readOnly: true
    });
    expect(execute).toHaveBeenCalledWith(
      "VACUUM INTO ?",
      ["/cache/support-work/local-progress.sqlite"]
    );
    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(finishSupportBundle).toHaveBeenCalledWith(
      "file:///cache/support-work",
      metadata
    );
    expect(bundle).toEqual({
      bundleUrl: "file:///cache/Chessticize-Support.zip",
      files: ["local-progress.sqlite", "diagnostic.txt", "manifest.json"],
      kind: "complete"
    });

    await client?.shareSupportBundle(bundle!.bundleUrl);
    await client?.discardSupportBundle(bundle!.bundleUrl);
    expect(shareSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
    expect(discardSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
  });

  it("discards the native workspace if SQLite snapshot creation fails", async () => {
    execute.mockRejectedValueOnce(new Error("database is locked"));
    const discardSupportBundleWorkspace = jest.fn(async () => undefined);
    (NativeModules as Record<string, unknown>).AndroidSupportDiagnostics = {
      copyText: jest.fn(async () => undefined),
      createSupportBundleWorkspace: jest.fn(async () => ({
        databaseSnapshotPath: "/cache/support-work/local-progress.sqlite",
        workspaceUrl: "file:///cache/support-work"
      })),
      discardSupportBundle: jest.fn(async () => undefined),
      discardSupportBundleWorkspace,
      finishSupportBundle: jest.fn(),
      shareSupportBundle: jest.fn(async () => undefined)
    };

    const client = createNativeAndroidSupportDiagnosticsClient(
      "/data/user/0/com.chessticize.mobile/databases/progress.sqlite"
    );

    await expect(client?.prepareSupportBundle({
      diagnosticText: "Android diagnostic",
      metadata: {
        appVersion: "1.2.3",
        platform: "android",
        progressProtection: "android_managed_backup"
      }
    })).rejects.toThrow("database is locked");
    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(discardSupportBundleWorkspace).toHaveBeenCalledWith(
      "file:///cache/support-work"
    );
  });

  it("formats useful Android details without claiming iCloud data is present", () => {
    const diagnostic = formatAndroidSupportOverviewDiagnostic(
      { appVersion: "1.2.3", buildNumber: "45" },
      "2026-07-26T16:43:00.000Z"
    );

    expect(diagnostic).toContain("Platform: Android");
    expect(diagnostic).toContain("Progress protection: Android-managed backup");
    expect(diagnostic).toContain("Support database snapshot: included");
    expect(diagnostic).not.toContain("Apple ID");
    expect(diagnostic).not.toContain("iCloud snapshot");
  });
});
