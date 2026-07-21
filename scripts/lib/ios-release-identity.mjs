import { readFileSync } from "node:fs";
import { join } from "node:path";
import iosReleaseVersionRenderer from "./ios-release-version.cjs";

export const renderCanonicalIOSReleaseConfig =
  iosReleaseVersionRenderer.renderIOSReleaseVersion;

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
    version: releaseVersion.iosPublicVersion,
    build: String(releaseVersion.iosBuildNumber),
    configMatchesCanonical: generatedConfig === expectedConfig,
    projectUsesGeneratedConfig,
    valid: generatedConfig === expectedConfig && projectUsesGeneratedConfig
  };
}
