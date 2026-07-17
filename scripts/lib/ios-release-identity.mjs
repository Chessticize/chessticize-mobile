import { readFileSync } from "node:fs";
import { join } from "node:path";

export function renderCanonicalIOSReleaseConfig(releaseVersion) {
  if (
    releaseVersion?.schemaVersion !== 1 ||
    typeof releaseVersion?.publicVersion !== "string" ||
    !/^\d+\.\d+(?:\.\d+)?$/u.test(releaseVersion.publicVersion) ||
    !Number.isSafeInteger(releaseVersion?.iosBuildNumber) ||
    releaseVersion.iosBuildNumber < 1
  ) {
    throw new Error("apps/mobile/release-version.json has invalid iOS version fields.");
  }
  return "// Generated from apps/mobile/release-version.json. Do not edit.\n" +
    `MARKETING_VERSION = ${releaseVersion.publicVersion}\n` +
    `CURRENT_PROJECT_VERSION = ${releaseVersion.iosBuildNumber}\n`;
}

export function loadIOSReleaseIdentity(repoRoot) {
  const readText = (path) => readFileSync(join(repoRoot, path), "utf8");
  const releaseVersion = JSON.parse(readText("apps/mobile/release-version.json"));
  const generatedConfig = readText("apps/mobile/ios/Config/ReleaseVersion.xcconfig");
  const project = readText("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj");
  const expectedConfig = renderCanonicalIOSReleaseConfig(releaseVersion);
  const projectUsesGeneratedConfig =
    project.includes("Config/Debug.xcconfig") &&
    project.includes("Config/Release.xcconfig") &&
    !/MARKETING_VERSION = \d/u.test(project) &&
    !/CURRENT_PROJECT_VERSION = \d/u.test(project);

  return {
    version: releaseVersion.publicVersion,
    build: String(releaseVersion.iosBuildNumber),
    configMatchesCanonical: generatedConfig === expectedConfig,
    projectUsesGeneratedConfig,
    valid: generatedConfig === expectedConfig && projectUsesGeneratedConfig
  };
}
