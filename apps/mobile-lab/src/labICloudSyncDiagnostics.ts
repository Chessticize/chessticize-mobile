import type { ICloudSyncDiagnosticsClient } from "../../mobile/src/platform/iCloudSyncDiagnostics.ts";
import type { LabScenarioId } from "./scenarioRegistry.ts";

export type LabMobilePlatform = "android" | "ios";

export function labMobilePlatformForScenario(
  scenarioId: LabScenarioId
): LabMobilePlatform {
  return scenarioId === "settings-android-backup" ? "android" : "ios";
}

export function createLabICloudSyncDiagnosticsClient(
  platform: LabMobilePlatform
): ICloudSyncDiagnosticsClient | null {
  if (platform !== "ios") {
    return null;
  }

  return {
    copyText: async () => {},
    discardSupportBundle: async () => {},
    prepareSupportBundle: async () => ({
      bundleUrl: "file:///tmp/chessticize-support.zip",
      files: [
        "local-progress.sqlite",
        "icloud-progress-snapshot.json",
        "diagnostic.txt",
        "manifest.json"
      ],
      kind: "complete"
    }),
    shareSupportBundle: async () => {}
  };
}
