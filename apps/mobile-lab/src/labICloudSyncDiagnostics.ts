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
  return {
    copyText: async () => {},
    discardSupportBundle: async () => {},
    prepareSupportBundle: async () => ({
      bundleUrl: "file:///tmp/chessticize-support.zip",
      files: platform === "android"
        ? [
            "local-progress.sqlite",
            "diagnostic.txt",
            "manifest.json"
          ]
        : [
            "local-progress.sqlite",
            "icloud-progress-v2.ndjson",
            "diagnostic.txt",
            "manifest.json"
          ],
      kind: "complete"
    }),
    shareSupportBundle: async () => {}
  };
}
