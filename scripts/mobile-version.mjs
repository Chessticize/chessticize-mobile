#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  advanceDevelopmentVersion,
  prepareReleaseVersion,
  validateDevelopmentVersion,
  validateReleaseVersion,
} from "./lib/mobile-versioning.mjs";

const require = createRequire(import.meta.url);
const {
  renderIOSDevelopmentVersion,
  renderIOSReleaseVersion,
} = require("./lib/ios-release-version.cjs");
const defaultRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function parseOptions(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (!name.startsWith("--") || index + 1 >= rest.length) {
      throw new Error(`Expected --name value, received ${name}.`);
    }
    options[name.slice(2)] = rest[index + 1];
    index += 1;
  }
  return { command, options };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function optionalInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function runMobileVersionCommand(args, output = process.stdout) {
  const { command, options } = parseOptions(args);
  const root = resolve(options.root ?? defaultRoot);
  const mobileRoot = join(root, "apps/mobile");
  const developmentPath = join(mobileRoot, "development-version.json");
  const releasePath = join(mobileRoot, "release-version.json");
  const developmentConfigPath = join(
    mobileRoot,
    "ios/Config/DevelopmentVersion.xcconfig",
  );
  const releaseConfigPath = join(mobileRoot, "ios/Config/ReleaseVersion.xcconfig");
  const developmentVersion = validateDevelopmentVersion(readJson(developmentPath));
  const releaseVersion = validateReleaseVersion(readJson(releasePath));

  if (command === "status") {
    output.write(`${JSON.stringify({ developmentVersion, releaseVersion }, null, 2)}\n`);
    return;
  }

  if (command === "check") {
    const expectedDevelopmentConfig = renderIOSDevelopmentVersion(developmentVersion);
    const expectedReleaseConfig = renderIOSReleaseVersion(releaseVersion);
    if (
      readFileSync(developmentConfigPath, "utf8") !== expectedDevelopmentConfig ||
      readFileSync(releaseConfigPath, "utf8") !== expectedReleaseConfig
    ) {
      throw new Error("Generated iOS version configuration is stale.");
    }
    return;
  }

  if (command === "advance-development" || command === "set-development") {
    if (command === "set-development" && options["public-version"] === undefined) {
      throw new Error("set-development requires --public-version.");
    }
    const nextDevelopment = advanceDevelopmentVersion(
      developmentVersion,
      options["public-version"],
    );
    writeJson(developmentPath, nextDevelopment);
    writeFileSync(
      developmentConfigPath,
      renderIOSDevelopmentVersion(nextDevelopment),
    );
    output.write(`${JSON.stringify(nextDevelopment, null, 2)}\n`);
    return;
  }

  if (command === "prepare-release") {
    const nextRelease = prepareReleaseVersion({
      developmentVersion,
      previousReleaseVersion: releaseVersion,
      publicVersion: options["public-version"],
      androidVersionCode: optionalInteger(
        options["android-version-code"],
        "Android version code",
      ),
      iosBuildNumber: optionalInteger(options["ios-build-number"], "iOS build number"),
    });
    writeJson(releasePath, nextRelease);
    writeFileSync(releaseConfigPath, renderIOSReleaseVersion(nextRelease));
    output.write(`${JSON.stringify(nextRelease, null, 2)}\n`);
    return;
  }

  throw new Error(
    "Usage: mobile-version.mjs status|check|prepare-release|advance-development|set-development [--public-version X.Y.Z] [--android-version-code N] [--ios-build-number N]",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runMobileVersionCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
