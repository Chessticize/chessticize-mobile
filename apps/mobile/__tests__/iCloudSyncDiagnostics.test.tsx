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
        "icloud-progress-v2.ndjson",
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
      latestSyncStatus: "Synced",
      progressV2: sampleProgressV2Diagnostics()
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
      metadata,
      undefined
    );
    expect(shareSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
    expect(discardSupportBundle).toHaveBeenCalledWith(bundle?.bundleUrl);
  });

  it("keeps copied diagnostics bounded to useful non-credential fields", () => {
    const failure = captureICloudSyncFailure({
      code: "icloud_fetch_failed",
      message: "Request for private@example.com used credential=secret",
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
      latestSyncStatus: "iCloud sync failed",
      progressV2: sampleProgressV2Diagnostics()
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
    expect(text).toContain("Message: CloudKit could not fetch the progress snapshot.");
    expect(overview).toContain("Latest sync status: iCloud sync failed");
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("secret");
    expect(overview).not.toContain("private@example.com");
    expect(overview).not.toContain("secret");
  });

  it("classifies payload writes as save failures and rejects unbounded identifiers", () => {
    const failure = captureICloudSyncFailure({
      code: "icloud_payload_write_failed",
      domain: "private@example.com",
      message: "Could not write /private/account@example.com/snapshot.json",
      userInfo: {
        nativeErrorCode: "identifier@example.com"
      }
    }, {
      attempt: "Manual",
      occurredAt: "2026-07-26T16:42:00.000Z"
    });

    expect(failure.phase).toBe("Save to iCloud");
    expect(failure.domain).toBe("CloudKit");
    expect(failure.nativeCode).toBeUndefined();
    expect(failure.message).toBe(
      "Chessticize could not prepare the progress snapshot for iCloud."
    );
    expect(formatICloudSyncFailureDiagnostic(failure, { appVersion: "1.2.3" }))
      .not.toContain("account@example.com");
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
        latestSyncStatus: "Ready",
        progressV2: sampleProgressV2Diagnostics()
      }
    })).rejects.toThrow(/invalid/);
  });
});

function sampleProgressV2Diagnostics() {
  return {
    phase: "bridging" as const,
    zoneInitialized: true,
    serverChangeTokenFingerprint: "0123456789abcdef",
    pendingOutboxCount: 2,
    oldestPendingOutboxAt: "2026-07-26T16:40:00.000Z",
    lastPullAt: "2026-07-26T16:41:00.000Z",
    lastPushAt: "2026-07-26T16:41:01.000Z",
    legacyImportPending: false,
    lastV1ChangeTagFingerprint: "fedcba9876543210",
    lastV1ImportAt: "2026-07-25T10:00:00.000Z"
  };
}
