import assert from "node:assert/strict";
import test from "node:test";
import {
  createLabICloudSyncDiagnosticsClient,
  labMobilePlatformForScenario
} from "./labICloudSyncDiagnostics.ts";
import { scenarioRegistry } from "./scenarioRegistry.ts";

test("every iOS Settings scenario keeps support diagnostics available", () => {
  const settingsScenarios = Object.values(scenarioRegistry).filter(
    (scenario) => scenario.group === "Settings"
  );

  for (const scenario of settingsScenarios) {
    const platform = labMobilePlatformForScenario(scenario.id);
    const diagnostics = createLabICloudSyncDiagnosticsClient(platform);

    if (scenario.id === "settings-android-backup") {
      assert.equal(platform, "android");
      assert.equal(diagnostics, null);
      continue;
    }

    assert.equal(platform, "ios");
    assert.ok(
      diagnostics,
      `${scenario.id} should expose the persistent iOS diagnostics entry`
    );
  }
});
