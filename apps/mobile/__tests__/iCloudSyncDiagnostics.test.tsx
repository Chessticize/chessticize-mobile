import { NativeModules } from "react-native";
import {
  captureICloudSyncFailure,
  createNativeICloudSyncDiagnosticsClient,
  formatICloudSyncFailureDiagnostic,
  formatICloudSyncOverviewDiagnostic
} from "../src/platform/iCloudSyncDiagnostics";

describe("iCloud sync diagnostics bridge", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).ICloudSyncDiagnostics;
  });

  it("falls back when the native module or persistent database path is absent", () => {
    expect(createNativeICloudSyncDiagnosticsClient(undefined)).toBeNull();
    expect(createNativeICloudSyncDiagnosticsClient("/progress.sqlite")).toBeNull();
  });

  it("prepares, shares, copies, and discards one native support bundle", async () => {
    const prepareSupportBundle = jest.fn(async () => ({
      bundleUrl: "file:///tmp/chessticize-support.zip",
      files: [
        "local-progress.sqlite",
        "icloud-progress-snapshot.json",
        "diagnostic.txt",
        "manifest.json"
      ],
      kind: "complete"
    }));
    const copyText = jest.fn(async () => undefined);
    const shareSupportBundle = jest.fn(async () => undefined);
    const discardSupportBundle = jest.fn(async () => undefined);
    (NativeModules as Record<string, unknown>).ICloudSyncDiagnostics = {
      copyText,
      discardSupportBundle,
      prepareSupportBundle,
      shareSupportBundle
    };
    const client = createNativeICloudSyncDiagnosticsClient("/progress.sqlite");
    const metadata = {
      appVersion: "1.2.3",
      buildNumber: "45",
      iCloudAccountStatus: "available" as const,
      iCloudSyncEnabled: true,
      latestSyncStatus: "Synced"
    };

    await client?.copyText("safe diagnostic");
    const bundle = await client?.prepareSupportBundle({
      diagnosticText: "safe diagnostic",
      metadata
    });
    await client?.shareSupportBundle(bundle!.bundleUrl);
    await client?.discardSupportBundle(bundle!.bundleUrl);

    expect(copyText).toHaveBeenCalledWith("safe diagnostic");
    expect(prepareSupportBundle).toHaveBeenCalledWith(
      "/progress.sqlite",
      "safe diagnostic",
      metadata
    );
    expect(shareSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
    expect(discardSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
  });

  it("keeps copied diagnostics bounded to useful non-credential fields", () => {
    const failure = captureICloudSyncFailure({
      code: "icloud_fetch_failed",
      message: "Request rate limited",
      userInfo: {
        cloudKitCode: 7,
        nativeErrorDomain: "CKErrorDomain",
        CKErrorRetryAfterKey: 12,
        appleId: "private@example.com",
        credential: "secret"
      }
    }, {
      attempt: "Manual",
      occurredAt: "2026-07-26T16:42:00.000Z"
    });
    const metadata = {
      appVersion: "1.2.3",
      buildNumber: "45",
      iCloudAccountStatus: "available" as const,
      iCloudSyncEnabled: true,
      latestSyncStatus: "iCloud sync failed"
    };

    const text = formatICloudSyncFailureDiagnostic(failure, metadata);
    const overview = formatICloudSyncOverviewDiagnostic(
      metadata,
      "2026-07-26T16:43:00.000Z",
      failure
    );

    expect(text).toContain("Code: icloud_fetch_failed");
    expect(text).toContain("Native code: 7");
    expect(text).toContain("Domain: CKErrorDomain");
    expect(text).toContain("Retry after: 12 seconds");
    expect(overview).toContain("Latest sync status: iCloud sync failed");
    expect(overview).not.toContain("private@example.com");
    expect(overview).not.toContain("secret");
  });

  it("rejects malformed native bundle results", async () => {
    (NativeModules as Record<string, unknown>).ICloudSyncDiagnostics = {
      copyText: jest.fn(),
      discardSupportBundle: jest.fn(async () => undefined),
      prepareSupportBundle: jest.fn(async () => ({ kind: "complete" })),
      shareSupportBundle: jest.fn(async () => undefined)
    };

    const client = createNativeICloudSyncDiagnosticsClient("/progress.sqlite");

    await expect(client?.prepareSupportBundle({
      diagnosticText: "diagnostic",
      metadata: {
        appVersion: "1.2.3",
        iCloudAccountStatus: "not_checked",
        iCloudSyncEnabled: true,
        latestSyncStatus: "Ready"
      }
    })).rejects.toThrow(/invalid/);
  });
});
