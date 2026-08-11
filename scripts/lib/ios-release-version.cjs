"use strict";

function renderIOSDevelopmentVersion(developmentVersion, releaseVersion) {
  if (
    developmentVersion?.schemaVersion !== 1 ||
    typeof developmentVersion?.plannedPublicVersion !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(
      developmentVersion.plannedPublicVersion,
    ) ||
    !Number.isSafeInteger(releaseVersion?.iosBuildNumber) ||
    releaseVersion.iosBuildNumber < 1
  ) {
    throw new Error("apps/mobile/development-version.json has invalid iOS version fields.");
  }
  return "// Generated from apps/mobile/development-version.json. Do not edit.\n" +
    `MARKETING_VERSION = ${developmentVersion.plannedPublicVersion}\n` +
    `CURRENT_PROJECT_VERSION = ${releaseVersion.iosBuildNumber}\n`;
}

function renderIOSReleaseVersion(releaseVersion) {
  if (
    releaseVersion?.schemaVersion !== 1 ||
    typeof releaseVersion?.iosPublicVersion !== "string" ||
    !/^\d+\.\d+(?:\.\d+)?$/u.test(releaseVersion.iosPublicVersion) ||
    !Number.isSafeInteger(releaseVersion?.iosBuildNumber) ||
    releaseVersion.iosBuildNumber < 1
  ) {
    throw new Error("apps/mobile/release-version.json has invalid iOS version fields.");
  }
  return "// Generated from apps/mobile/release-version.json. Do not edit.\n" +
    `MARKETING_VERSION = ${releaseVersion.iosPublicVersion}\n` +
    `CURRENT_PROJECT_VERSION = ${releaseVersion.iosBuildNumber}\n`;
}

module.exports = { renderIOSDevelopmentVersion, renderIOSReleaseVersion };
