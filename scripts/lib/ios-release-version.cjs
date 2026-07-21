"use strict";

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

module.exports = { renderIOSReleaseVersion };
