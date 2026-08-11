import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  advanceDevelopmentVersion,
  prepareReleaseVersion,
  validateDevelopmentVersion,
} from "./lib/mobile-versioning.mjs";
import { runMobileVersionCommand } from "./mobile-version.mjs";

test("a release cut copies the planned public version without advancing main", () => {
  const developmentVersion = {
    schemaVersion: 1,
    plannedPublicVersion: "1.5.0",
  };
  const previousReleaseVersion = {
    schemaVersion: 1,
    publicVersion: "1.4.1",
    iosPublicVersion: "1.4.1",
    androidVersionCode: 16,
    iosBuildNumber: 1,
  };

  assert.deepEqual(
    prepareReleaseVersion({ developmentVersion, previousReleaseVersion }),
    {
      schemaVersion: 1,
      publicVersion: "1.5.0",
      iosPublicVersion: "1.5.0",
      androidVersionCode: 17,
      iosBuildNumber: 1,
    },
  );
  assert.deepEqual(developmentVersion, {
    schemaVersion: 1,
    plannedPublicVersion: "1.5.0",
  });
});

test("main advances one patch immediately after the release branch is cut", () => {
  assert.deepEqual(
    advanceDevelopmentVersion({
      schemaVersion: 1,
      plannedPublicVersion: "1.5.0",
    }),
    {
      schemaVersion: 1,
      plannedPublicVersion: "1.5.1",
    },
  );

  assert.deepEqual(
    advanceDevelopmentVersion(
      {
        schemaVersion: 1,
        plannedPublicVersion: "1.5.1",
      },
      "2.0.0",
    ),
    {
      schemaVersion: 1,
      plannedPublicVersion: "2.0.0",
    },
  );
});

test("replacement candidates increment only the consumed build identities", () => {
  const currentReleaseVersion = {
    schemaVersion: 1,
    publicVersion: "1.5.0",
    iosPublicVersion: "1.5.0",
    androidVersionCode: 17,
    iosBuildNumber: 1,
  };

  assert.deepEqual(
    prepareReleaseVersion({
      developmentVersion: {
        schemaVersion: 1,
        plannedPublicVersion: "1.5.0",
      },
      previousReleaseVersion: currentReleaseVersion,
    }),
    {
      ...currentReleaseVersion,
      androidVersionCode: 18,
      iosBuildNumber: 2,
    },
  );
});

test("development versions use a three-part numeric public version", () => {
  assert.deepEqual(
    validateDevelopmentVersion({
      schemaVersion: 1,
      plannedPublicVersion: "2.0.0",
    }),
    {
      schemaVersion: 1,
      plannedPublicVersion: "2.0.0",
    },
  );

  for (const invalid of ["2", "2.0", "2.0.0-dev", "01.5.0"]) {
    assert.throws(
      () => validateDevelopmentVersion({
        schemaVersion: 1,
        plannedPublicVersion: invalid,
      }),
      /development version/u,
    );
  }
});

test("version transitions reject public-version rollback", () => {
  assert.throws(
    () => advanceDevelopmentVersion({
      schemaVersion: 1,
      plannedPublicVersion: "2.0.0",
    }, "1.9.9"),
    /must advance/u,
  );
  assert.throws(
    () => prepareReleaseVersion({
      developmentVersion: {
        schemaVersion: 1,
        plannedPublicVersion: "1.4.0",
      },
      previousReleaseVersion: {
        schemaVersion: 1,
        publicVersion: "1.4.1",
        iosPublicVersion: "1.4.1",
        androidVersionCode: 16,
        iosBuildNumber: 1,
      },
    }),
    /cannot move backward/u,
  );
});

test("the CLI writes each version only in its intended transition", () => {
  const root = mkdtempSync(join(tmpdir(), "chessticize-versioning-"));
  const mobileRoot = join(root, "apps/mobile");
  const configRoot = join(mobileRoot, "ios/Config");
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(join(mobileRoot, "development-version.json"), JSON.stringify({
    schemaVersion: 1,
    plannedPublicVersion: "1.5.0",
  }));
  writeFileSync(join(mobileRoot, "release-version.json"), JSON.stringify({
    schemaVersion: 1,
    publicVersion: "1.4.1",
    iosPublicVersion: "1.4.1",
    androidVersionCode: 16,
    iosBuildNumber: 1,
  }));
  const developmentConfig =
    "// Generated from apps/mobile/development-version.json. Do not edit.\n" +
    "MARKETING_VERSION = 1.5.0\n" +
    "CURRENT_PROJECT_VERSION = 1\n";
  writeFileSync(join(configRoot, "DevelopmentVersion.xcconfig"), developmentConfig);
  writeFileSync(join(configRoot, "ReleaseVersion.xcconfig"), "stale\n");
  const output = { write() {} };

  runMobileVersionCommand([
    "prepare-release",
    "--root",
    root,
  ], output);
  assert.deepEqual(
    JSON.parse(readFileSync(join(mobileRoot, "release-version.json"), "utf8")),
    {
      schemaVersion: 1,
      publicVersion: "1.5.0",
      iosPublicVersion: "1.5.0",
      androidVersionCode: 17,
      iosBuildNumber: 1,
    },
  );
  assert.equal(
    JSON.parse(readFileSync(join(mobileRoot, "development-version.json"), "utf8"))
      .plannedPublicVersion,
    "1.5.0",
  );
  assert.equal(
    readFileSync(join(configRoot, "DevelopmentVersion.xcconfig"), "utf8"),
    developmentConfig,
  );

  runMobileVersionCommand([
    "advance-development",
    "--root",
    root,
    "--public-version",
    "2.0.0",
  ], output);
  assert.equal(
    JSON.parse(readFileSync(join(mobileRoot, "development-version.json"), "utf8"))
      .plannedPublicVersion,
    "2.0.0",
  );
  assert.match(
    readFileSync(join(configRoot, "DevelopmentVersion.xcconfig"), "utf8"),
    /MARKETING_VERSION = 2\.0\.0/u,
  );
  assert.match(
    readFileSync(join(configRoot, "ReleaseVersion.xcconfig"), "utf8"),
    /MARKETING_VERSION = 1\.5\.0/u,
  );
});
