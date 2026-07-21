import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import sharedRenderer from "./lib/ios-release-version.cjs";
import { renderCanonicalIOSReleaseConfig } from "./lib/ios-release-identity.mjs";

const require = createRequire(import.meta.url);
const generator = require("../apps/mobile/scripts/ios-release-version.js");

test("the iOS generator and verifier use one shared release renderer", () => {
  assert.equal(
    generator.renderIOSReleaseVersion,
    sharedRenderer.renderIOSReleaseVersion
  );
  assert.equal(
    renderCanonicalIOSReleaseConfig,
    sharedRenderer.renderIOSReleaseVersion
  );
});

test("the shared iOS release renderer validates and renders the xcconfig contract", () => {
  assert.equal(
    sharedRenderer.renderIOSReleaseVersion({
      schemaVersion: 1,
      publicVersion: "1.1",
      iosPublicVersion: "9.8.7",
      iosBuildNumber: 42
    }),
    "// Generated from apps/mobile/release-version.json. Do not edit.\n" +
      "MARKETING_VERSION = 9.8.7\n" +
      "CURRENT_PROJECT_VERSION = 42\n"
  );

  for (const invalid of [
    undefined,
    { schemaVersion: 2, iosPublicVersion: "9.8.7", iosBuildNumber: 42 },
    { schemaVersion: 1, publicVersion: "1.1", iosBuildNumber: 42 },
    { schemaVersion: 1, iosPublicVersion: "9", iosBuildNumber: 42 },
    { schemaVersion: 1, iosPublicVersion: "9.8.7-beta", iosBuildNumber: 42 },
    { schemaVersion: 1, iosPublicVersion: "9.8.7", iosBuildNumber: 0 },
    { schemaVersion: 1, iosPublicVersion: "9.8.7", iosBuildNumber: 1.5 }
  ]) {
    assert.throws(
      () => sharedRenderer.renderIOSReleaseVersion(invalid),
      /invalid iOS version fields/u
    );
  }
});
