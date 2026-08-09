import { readFileSync } from "node:fs";
import { join } from "node:path";
import iosReleaseVersionRenderer from "./ios-release-version.cjs";

export const renderCanonicalIOSReleaseConfig =
  iosReleaseVersionRenderer.renderIOSReleaseVersion;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function unquoteBuildSetting(value) {
  return value?.replace(/^"|"$/gu, "") ?? null;
}

function loadTargetBuildConfiguration(project, configurationName) {
  const escapedName = escapeRegExp(configurationName);
  const blockPattern = new RegExp(
    `/\\* ${escapedName} \\*/ = \\{\\s*` +
      "isa = XCBuildConfiguration;\\s*" +
      "baseConfigurationReference = [^\\n]+\\s*" +
      "buildSettings = \\{([\\s\\S]*?)\\n\\s*\\};\\s*" +
      `name = ${escapedName};`,
    "u"
  );
  const settings = project.match(blockPattern)?.[1];
  if (!settings) {
    return null;
  }

  const valueFor = (key) => {
    const match = settings.match(
      new RegExp(`^\\s*${escapeRegExp(key)} = ([^;]+);$`, "mu")
    );
    return unquoteBuildSetting(match?.[1]);
  };

  return {
    bundleIdentifier: valueFor("PRODUCT_BUNDLE_IDENTIFIER"),
    displayName: valueFor("INFOPLIST_KEY_CFBundleDisplayName"),
    entitlements: valueFor("CODE_SIGN_ENTITLEMENTS")
  };
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
  const debug = loadTargetBuildConfiguration(project, "Debug");
  const release = loadTargetBuildConfiguration(project, "Release");

  return {
    version: releaseVersion.iosPublicVersion,
    build: String(releaseVersion.iosBuildNumber),
    configMatchesCanonical: generatedConfig === expectedConfig,
    projectUsesGeneratedConfig,
    debug,
    release,
    valid: generatedConfig === expectedConfig && projectUsesGeneratedConfig
  };
}
