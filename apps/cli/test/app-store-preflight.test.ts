import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("App Store preflight CLI reports automatable checks and manual release gates", () => {
  const releaseVersion = JSON.parse(
    readFileSync(resolve("apps/mobile/release-version.json"), "utf8")
  ) as { iosPublicVersion: string };
  const result = spawnSync(
    process.execPath,
    ["scripts/app-store-preflight.mjs", "--json"],
    {
      cwd: resolve("."),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "pass");
  assert.equal(payload.summary.failed, 0);
  assert.ok(payload.summary.passed >= 9);
  assert.ok(payload.summary.manual >= 4);

  const checkNames = new Set(payload.checks.map((entry: { name: string }) => entry.name));
  assert.ok(checkNames.has("GPL license text is present"));
  assert.ok(checkNames.has("Third-party notices inventory covers direct runtime packages"));
  assert.ok(checkNames.has("Third-party notice audit passes"));
  assert.ok(checkNames.has("Release source rule is documented"));
  assert.ok(checkNames.has(`iOS release identity is fixed for ${releaseVersion.iosPublicVersion}`));
  assert.ok(checkNames.has("Store screenshot capture flow is wired"));
  assert.ok(checkNames.has("TestFlight QA checklist is explicit about real-device execution"));
  assert.ok(checkNames.has("App Store archive and upload path is documented"));

  const manualNames = new Set(payload.manual.map((entry: { name: string }) => entry.name));
  assert.ok(manualNames.has("Refresh third-party notices against the final lockfile"));
  assert.ok(manualNames.has("Create the public source release tag"));
  assert.ok(manualNames.has("Configure Apple signing team and Xcode account"));
  assert.ok(manualNames.has("Capture final sanitized App Store screenshots"));
  assert.ok(manualNames.has("Execute the internal TestFlight physical-device pass"));

  const signingGate = payload.manual.find(
    (entry: { name: string; detail: string }) => entry.name === "Configure Apple signing team and Xcode account"
  );
  assert.ok(signingGate?.detail.includes("APPLE_DEVELOPMENT_TEAM"));
  assert.ok(signingGate?.detail.includes("10-character Apple Developer Team ID"));
  assert.ok(signingGate?.detail.includes("Xcode"));
});
