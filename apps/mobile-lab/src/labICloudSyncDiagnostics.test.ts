import assert from "node:assert/strict";
import test from "node:test";
import {
  createLabICloudSyncDiagnosticsClient,
  labMobilePlatformForScenario
} from "./labICloudSyncDiagnostics.ts";
import { scenarioRegistry } from "./scenarioRegistry.ts";

test("every Settings scenario keeps platform-appropriate support diagnostics available", async () => {
  const settingsScenarios = Object.values(scenarioRegistry).filter(
    (scenario) => scenario.group === "Settings"
  );

  for (const scenario of settingsScenarios) {
    const platform = labMobilePlatformForScenario(scenario.id);
    const diagnostics = createLabICloudSyncDiagnosticsClient(platform);

    if (scenario.id === "settings-android-backup") {
      assert.equal(platform, "android");
      assert.ok(diagnostics);
      const bundle = await diagnostics.prepareSupportBundle({
        diagnosticText: "Android diagnostic",
        metadata: {
          appVersion: "1.2.2",
          buildNumber: "38",
          platform: "android",
          progressProtection: "android_managed_backup"
        }
      });
      assert.deepEqual(bundle.files, [
        "local-progress.sqlite",
        "diagnostic.txt",
        "manifest.json"
      ]);
      continue;
    }

    assert.equal(platform, "ios");
    assert.ok(
      diagnostics,
      `${scenario.id} should expose the persistent iOS diagnostics entry`
    );
  }
});
