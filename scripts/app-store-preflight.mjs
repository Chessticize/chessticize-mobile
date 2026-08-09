#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStockfishArtifacts } from "./lib/stockfish-artifacts.mjs";
import { loadIOSReleaseIdentity } from "./lib/ios-release-identity.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputJson = process.argv.includes("--json");

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function fileExists(path) {
  return existsSync(join(repoRoot, path));
}

function uniqueMatches(source, pattern) {
  return Array.from(new Set(Array.from(source.matchAll(pattern), (match) => match[1].trim())));
}

function unquoteBuildSetting(value) {
  return value.replace(/^"|"$/gu, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function plistStringArrayForKey(plist, key) {
  const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<array>([\\s\\S]*?)</array>`, "u");
  const match = plist.match(pattern);
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/<string>([^<]+)<\/string>/gu), (entry) => entry[1]);
}

function stringArrayEquals(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

const checks = [];
const manual = [];

function check(name, passed, detail) {
  checks.push({
    name,
    status: passed ? "pass" : "fail",
    detail
  });
}

function manualGate(name, detail) {
  manual.push({
    name,
    status: "manual",
    detail
  });
}

const license = readText("LICENSE");
const notices = readText("THIRD_PARTY_NOTICES.md");
const rootPackage = readJson("package.json");
const stockfishArtifacts = loadStockfishArtifacts(repoRoot);
const mobilePackage = readJson("apps/mobile/package.json");
const readme = readText("README.md");
const releasePolicy = readText("docs/RELEASE_SOURCE_POLICY.md");
const releaseNotes = readText("docs/RELEASE_NOTES.md");
const releaseNotesTemplate = readText("docs/releases/RELEASE_NOTES_TEMPLATE.md");
const appStoreUpload = readText("docs/APP_STORE_UPLOAD.md");
const storeAssets = readText("docs/STORE_ASSETS.md");
const appStoreMetadata = readJson("config/app-store-metadata-en-us-v1.json");
const accessibilityAudit = readText("docs/ACCESSIBILITY_AUDIT.md");
const appStoreAccessibility = readJson("config/app-store-accessibility-v1.json");
const accessibilityPage = readText("site/accessibility/index.html");
const accessibilityPageText = accessibilityPage.replace(/\s+/gu, " ");
const storeAssetsE2e = readText("apps/mobile/e2e/store-assets.e2e.js");
const testFlightQa = readText("docs/TESTFLIGHT_QA.md");
const privacyDisclosure = readText("docs/APP_PRIVACY_DISCLOSURE.md");
const privacyPolicy = readText("docs/PRIVACY_POLICY.md");
const appStorePlan = readText("docs/APP_STORE_PLAN.md");
const pbxproj = readText("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj");
const infoPlist = readText("apps/mobile/ios/ChessticizeMobile/Info.plist");
const privacyManifest = readText("apps/mobile/ios/ChessticizeMobile/PrivacyInfo.xcprivacy");
const entitlements = readText("apps/mobile/ios/ChessticizeMobile/ChessticizeMobile.entitlements");
const devEntitlements = readText("apps/mobile/ios/ChessticizeMobile/ChessticizeMobileDev.entitlements");
const exportOptions = readText("apps/mobile/ios/ExportOptions.app-store-connect.plist");
const thirdPartyAudit = spawnSync(
  process.execPath,
  ["scripts/app-store-third-party-audit.mjs", "--json"],
  {
    cwd: repoRoot,
    encoding: "utf8"
  }
);
const iosReleaseIdentity = loadIOSReleaseIdentity(repoRoot);
const normalizedIOSVersion =
  iosReleaseIdentity.version.split(".").length === 2
    ? `${iosReleaseIdentity.version}.0`
    : iosReleaseIdentity.version;
const iosReleaseTag =
  `ios-v${normalizedIOSVersion}-build-${iosReleaseIdentity.build}`;
const iosReleaseNotePath = `docs/releases/${iosReleaseTag}.md`;
const iosReleaseNote = fileExists(iosReleaseNotePath)
  ? readText(iosReleaseNotePath)
  : "";
let thirdPartyAuditPayload = null;
try {
  thirdPartyAuditPayload = JSON.parse(thirdPartyAudit.stdout || "{}");
} catch {
  thirdPartyAuditPayload = null;
}

const bundleIdentifiers = uniqueMatches(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g);
const deviceFamilies = uniqueMatches(pbxproj, /TARGETED_DEVICE_FAMILY = ([^;]+);/g);
const targetedDeviceFamily = deviceFamilies.length === 1 ? unquoteBuildSetting(deviceFamilies[0]) : "";
const iphoneOrientations = plistStringArrayForKey(infoPlist, "UISupportedInterfaceOrientations");
const ipadOrientations = plistStringArrayForKey(infoPlist, "UISupportedInterfaceOrientations~ipad");
const expectedIphoneOrientations = [
  "UIInterfaceOrientationPortrait"
];
const expectedIpadOrientations = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight"
];
const fullScreenLocked = infoPlist.includes("<key>UIRequiresFullScreen</key>");
const runtimeDependencies = Array.from(new Set([
  ...Object.keys(rootPackage.dependencies ?? {}),
  ...Object.keys(mobilePackage.dependencies ?? {})
])).sort();
const missingRuntimeNotices = runtimeDependencies.filter((dependency) => !notices.includes(`| \`${dependency}\` |`));

check(
  "GPL license text is present",
  license.includes("SPDX-License-Identifier: GPL-3.0-or-later") &&
    license.includes("GNU GENERAL PUBLIC LICENSE") &&
    license.includes("Version 3, 29 June 2007"),
  "LICENSE must contain the full GPLv3 text and GPL-3.0-or-later SPDX marker."
);

check(
  "Third-party notices cover release-critical dependencies",
  notices.includes("Stockfish 18") &&
    notices.includes("sf_18") &&
    notices.includes("Lichess") &&
    notices.includes("react-native-chessboard") &&
    notices.includes("React Native"),
  "THIRD_PARTY_NOTICES.md must cover Stockfish, Lichess puzzle data, chessboard, and React Native notices."
);

check(
  "Third-party notices inventory covers direct runtime packages",
  missingRuntimeNotices.length === 0,
  `Missing direct runtime dependency notices: ${missingRuntimeNotices.join(", ") || "none"}.`
);

check(
  "Third-party notice audit passes",
  rootPackage.scripts?.["app-store:third-party-audit"] === "node scripts/app-store-third-party-audit.mjs" &&
    thirdPartyAudit.status === 0 &&
    thirdPartyAuditPayload?.status === "pass",
  thirdPartyAuditPayload
    ? `Third-party audit status=${thirdPartyAuditPayload.status}; failed=${thirdPartyAuditPayload.summary?.failed ?? "unknown"}.`
    : `Third-party audit failed before JSON output: ${thirdPartyAudit.stderr || thirdPartyAudit.stdout || "no output"}.`
);

check(
  "Bundled Stockfish license artifacts are present",
  fileExists(stockfishArtifacts.licensePath) &&
    fileExists(stockfishArtifacts.authorsPath) &&
    fileExists(stockfishArtifacts.readmePath),
  "The embedded engine must ship its GPL text, authors, and source notes."
);

check(
  "Release source rule is documented",
  rootPackage.scripts?.["app-store:release-manifest"] === "node scripts/app-store-release-manifest.mjs" &&
    releasePolicy.includes("Do not submit a binary built from an untagged commit") &&
    releasePolicy.includes("pnpm app-store:release-manifest") &&
    readme.includes("[Release Source Policy](docs/RELEASE_SOURCE_POLICY.md)") &&
    readme.includes("pnpm app-store:release-manifest"),
  "README and release policy must require a public source tag and release manifest for every submitted binary."
);

check(
  "Release-note preparation is part of the release contract",
  readme.includes("[Release Notes](docs/RELEASE_NOTES.md)") &&
    releasePolicy.includes("docs/RELEASE_NOTES.md") &&
    releasePolicy.includes("docs/releases/RELEASE_NOTES_TEMPLATE.md") &&
    appStoreUpload.includes("docs/RELEASE_NOTES.md") &&
    releaseNotes.includes("before its source tag is created") &&
    /What’s New in this\s+Version/u.test(releaseNotes) &&
    /at or below 300\s+Unicode characters/u.test(releaseNotes) &&
    /Do\s+not include a raw release URL/u.test(releaseNotes) &&
    releaseNotesTemplate.includes("## Store copy (`en-US`)") &&
    releaseNotesTemplate.includes("## Release details") &&
    releaseNotesTemplate.includes("contains no raw URL") &&
    /at most 300 Unicode\s+characters/u.test(releaseNotesTemplate) &&
    releaseNotesTemplate.includes("## Release-note review"),
  "README, source policy, upload runbook, release-note contract, and template must require approved build-specific customer copy before tagging."
);

check(
  `iOS release identity is fixed for ${iosReleaseIdentity.version}`,
  iosReleaseIdentity.valid &&
    bundleIdentifiers.length === 2 &&
    bundleIdentifiers.includes("com.chessticize.mobile") &&
    bundleIdentifiers.includes("com.chessticize.mobile.dev") &&
    iosReleaseIdentity.release?.bundleIdentifier === "com.chessticize.mobile" &&
    iosReleaseIdentity.release?.displayName === "Chessticize" &&
    iosReleaseIdentity.release?.entitlements === "ChessticizeMobile/ChessticizeMobile.entitlements" &&
    iosReleaseIdentity.debug?.bundleIdentifier === "com.chessticize.mobile.dev" &&
    iosReleaseIdentity.debug?.displayName === "Chessticize Dev" &&
    iosReleaseIdentity.debug?.entitlements === "ChessticizeMobile/ChessticizeMobileDev.entitlements" &&
    deviceFamilies.length === 1 &&
    targetedDeviceFamily === "1,2" &&
    !fullScreenLocked &&
    stringArrayEquals(iphoneOrientations, expectedIphoneOrientations) &&
    stringArrayEquals(ipadOrientations, expectedIpadOrientations),
  `Found canonicalVersion=${iosReleaseIdentity.version}, canonicalBuild=${iosReleaseIdentity.build}, configMatchesCanonical=${iosReleaseIdentity.configMatchesCanonical}, projectUsesGeneratedConfig=${iosReleaseIdentity.projectUsesGeneratedConfig}, debugIdentity=${JSON.stringify(iosReleaseIdentity.debug)}, releaseIdentity=${JSON.stringify(iosReleaseIdentity.release)}, bundleIdentifiers=${bundleIdentifiers.join(",")}, deviceFamilies=${deviceFamilies.join(",")}, fullScreenLocked=${fullScreenLocked}, iphoneOrientations=${iphoneOrientations.join("|")}, ipadOrientations=${ipadOrientations.join("|")}.`
);

check(
  "Export compliance flag is set",
  infoPlist.includes("<key>ITSAppUsesNonExemptEncryption</key>") &&
    infoPlist.includes("<false/>"),
  `Info.plist must declare ITSAppUsesNonExemptEncryption=false for the ${iosReleaseIdentity.version} app.`
);

check(
  "Privacy documents stay aligned with no-collection optional iCloud sync behavior",
    privacyDisclosure.includes("Data Not Collected") &&
    privacyDisclosure.includes("Tracking: **No**") &&
    privacyDisclosure.includes("https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md") &&
    privacyPolicy.includes("does not collect data from the app") &&
    privacyPolicy.includes("private iCloud account") &&
    privacyPolicy.includes("does not operate a sync server") &&
    privacyPolicy.includes("does not track you") &&
    privacyManifest.includes("<key>NSPrivacyTracking</key>") &&
    privacyManifest.includes("<false/>") &&
    privacyManifest.includes("<key>NSPrivacyCollectedDataTypes</key>") &&
    privacyManifest.includes("<array/>") &&
    entitlements.includes("iCloud.com.chessticize.mobile") &&
    !entitlements.includes("iCloud.com.chessticize.mobile.dev") &&
    devEntitlements.includes("iCloud.com.chessticize.mobile.dev") &&
    devEntitlements.includes("com.apple.developer.icloud-container-environment") &&
    devEntitlements.includes("<string>Development</string>") &&
    !devEntitlements.includes("<string>iCloud.com.chessticize.mobile</string>") &&
    entitlements.includes("<string>CloudKit</string>") &&
    devEntitlements.includes("<string>CloudKit</string>") &&
    pbxproj.includes("ICloudProgressSync.m in Sources") &&
    pbxproj.includes("CloudKit.framework in Frameworks"),
  "Privacy disclosure, public privacy policy, iOS privacy manifest, and isolated production/Development CloudKit entitlements must describe no collection, no tracking, and optional private iCloud sync."
);

check(
  "English App Store metadata fits the current field limits",
  appStoreMetadata.appName?.value === "Chessticize" &&
    appStoreMetadata.appName?.decision === "keep" &&
    appStoreMetadata.subtitle === "Offline Chess Puzzle Trainer" &&
    Array.from(appStoreMetadata.appName.value).length <= appStoreMetadata.limits.appNameCharacters &&
    Array.from(appStoreMetadata.subtitle).length <= appStoreMetadata.limits.subtitleCharacters &&
    Array.from(appStoreMetadata.promotionalText).length <= appStoreMetadata.limits.promotionalTextCharacters &&
    Array.from(appStoreMetadata.description).length <= appStoreMetadata.limits.descriptionCharacters &&
    Buffer.byteLength(appStoreMetadata.keywords, "utf8") <= appStoreMetadata.limits.keywordsBytes &&
    !appStoreMetadata.keywords.includes(", ") &&
    appStoreMetadata.promotionalText.includes("rating-matched chess puzzles") &&
    appStoreMetadata.promotionalText.includes("Arrow Duel") &&
    appStoreMetadata.promotionalText.includes("scheduled Review") &&
    appStoreMetadata.description.startsWith("Practice chess puzzles with purpose") &&
    appStoreMetadata.description.includes("chess puzzle trainer") &&
    !appStoreMetadata.description.includes("Tactical Profile") &&
    !appStoreMetadata.description.includes("weakness") &&
    appStoreMetadata.currentVersionWhatsNew?.sourceTag === iosReleaseTag &&
    appStoreMetadata.currentVersionWhatsNew?.status === "release-candidate" &&
    Array.from(appStoreMetadata.currentVersionWhatsNew.storeCopy).length <=
      appStoreMetadata.limits.chessticizeWhatsNewCharacters &&
    !/https?:\/\//u.test(appStoreMetadata.currentVersionWhatsNew.storeCopy) &&
    !appStoreMetadata.currentVersionWhatsNew.storeCopy.includes("experimental"),
  "The canonical en-US metadata must stay paste-ready, puzzle-led, within Apple's limits, and independent of weakness detection."
);

check(
  "iOS release note matches the canonical release identity and What's New copy",
  iosReleaseNote.includes(`Public version: \`${iosReleaseIdentity.version}\``) &&
    iosReleaseNote.includes(`Build or version code: \`${iosReleaseIdentity.build}\``) &&
    iosReleaseNote.includes(`Source tag: \`${iosReleaseTag}\``) &&
    iosReleaseNote.includes(appStoreMetadata.currentVersionWhatsNew.storeCopy),
  `${iosReleaseNotePath} must exist and match iOS ${iosReleaseIdentity.version} build ${iosReleaseIdentity.build}, ${iosReleaseTag}, and the canonical What's New copy.`
);

check(
  "Store metadata document contains upload-ready public fields",
  storeAssets.includes("| App name | `Chessticize` |") &&
    storeAssets.includes("| Subtitle | `Offline Chess Puzzle Trainer` |") &&
    storeAssets.includes("config/app-store-metadata-en-us-v1.json") &&
    storeAssets.includes("| Support URL | `https://chessticize.github.io/chessticize-mobile/support/` |") &&
    storeAssets.includes("| Marketing URL | `https://chessticize.github.io/chessticize-mobile/` |") &&
    storeAssets.includes("| Accessibility URL | `https://chessticize.github.io/chessticize-mobile/accessibility/` |") &&
    storeAssets.includes("| Privacy policy URL | `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md` |") &&
    storeAssets.includes("6.9\"") &&
    storeAssets.includes("6.1\""),
  "STORE_ASSETS.md must include the public metadata URLs and required screenshot display groups."
);

check(
  "Accessibility declarations remain evidence-backed and conservative",
  appStoreAccessibility.issue === 416 &&
    appStoreAccessibility.publicationDecision?.status === "no-declarations-ready" &&
    appStoreAccessibility.remediationPolicy?.status === "demand-driven-deferral" &&
    JSON.stringify(appStoreAccessibility.remediationPolicy?.closedIssues) ===
      JSON.stringify([426, 427, 428, 429, 430, 431, 432]) &&
    appStoreAccessibility.publicationDecision.iphoneDeclarations?.length === 0 &&
    appStoreAccessibility.publicationDecision.ipadDeclarations?.length === 0 &&
    Object.values(appStoreAccessibility.features).every(
      (feature) => feature.status === "not-declared"
    ) &&
    appStoreAccessibility.accessibilityUrl ===
      "https://chessticize.github.io/chessticize-mobile/accessibility/" &&
    accessibilityAudit.includes("Declare **no accessibility features**") &&
    accessibilityAudit.includes("Standard, Arrow Duel, Review, and Replay") &&
    accessibilityAudit.includes("demand-driven deferral") &&
    accessibilityPage.includes("common chess puzzle task") &&
    accessibilityPage.includes("not declared in the App Store") &&
    accessibilityPage.includes("not currently scheduled") &&
    accessibilityPage.includes("closed as not planned") &&
    accessibilityPage.includes("does not change the current app") &&
    accessibilityPageText.includes("No color-only blocker has been confirmed") &&
    accessibilityPageText.includes("complete grayscale common-task walkthrough is still pending") &&
    !accessibilityPage.includes("We will") &&
    !accessibilityPage.includes("demonstrated user demand") &&
    !JSON.stringify(appStoreAccessibility).includes("followUpIssues"),
  "The canonical contract, audit, and public page must distinguish verified gaps from pending checks and leave partial accessibility features undeclared on both iPhone and iPad."
);

check(
  "Store screenshot capture flow is wired",
  rootPackage.scripts?.["mobile:e2e:store-assets:ios"]?.includes("e2e:store-assets:ios") &&
    rootPackage.scripts?.["mobile:e2e:build:ios:release"]?.includes("e2e:build:ios:release") &&
    rootPackage.scripts?.["mobile:e2e:store-assets:ios:release"]?.includes("e2e:store-assets:ios:release") &&
    rootPackage.scripts?.["app-store:screenshot-audit"] === "node scripts/app-store-screenshot-audit.mjs" &&
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("CHESSTICIZE_CAPTURE_STORE_ASSETS=1") &&
    mobilePackage.scripts?.["e2e:build:ios:release"]?.includes("ios.sim.release") &&
    mobilePackage.scripts?.["e2e:store-assets:ios:release"]?.includes("CHESSTICIZE_CAPTURE_STORE_ASSETS=1") &&
    mobilePackage.scripts?.["e2e:store-assets:ios:release"]?.includes("ios.sim.release") &&
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("e2e/store-assets.e2e.js") &&
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("artifacts/store-assets") &&
    storeAssetsE2e.includes("CHESSTICIZE_CAPTURE_STORE_ASSETS") &&
    storeAssetsE2e.includes("describe.skip") &&
    storeAssetsE2e.includes("app-store-01-practice-tab") &&
    storeAssetsE2e.includes("app-store-06-arrow-duel") &&
    storeAssetsE2e.includes("app-store-07-custom-setup") &&
    storeAssetsE2e.includes("app-store-08-review-session") &&
    storeAssetsE2e.includes("Landscape iOS capture requires a dedicated iPad Simulator") &&
    storeAssets.includes("pnpm app-store:screenshot-audit") &&
    storeAssets.includes("The full calibration wrapper requires a dedicated iPad simulator.") &&
    storeAssets.includes("iphone-6.9") &&
    storeAssets.includes("iphone-6.1") &&
    storeAssets.includes("ipad-13") &&
    storeAssets.includes("pnpm mobile:e2e:store-assets:ios:release") &&
    storeAssets.includes("app-store-04-settings-tab") &&
    storeAssets.includes("app-store-05-standard-sprint"),
  "Store screenshot capture and final artifact audit must stay opt-in, documented, and wired to the named Detox capture spec."
);

check(
  "TestFlight physical-device diagnostics are explicitly optional",
  testFlightQa.includes("not an App Store release gate") &&
    testFlightQa.includes("not required") &&
    testFlightQa.includes("App Store Connect build") &&
    testFlightQa.includes("Result | Pending") &&
    testFlightQa.includes("Release Rule"),
  "TESTFLIGHT_QA.md must keep physical-device diagnostics optional and CI/simulator validation release-authoritative."
);

check(
  "App Store archive and upload path is documented",
  readme.includes("[App Store Upload](docs/APP_STORE_UPLOAD.md)") &&
    releasePolicy.includes("docs/APP_STORE_UPLOAD.md") &&
    testFlightQa.includes("docs/APP_STORE_UPLOAD.md") &&
    rootPackage.scripts?.["app-store:signing-readiness"] === "node scripts/app-store-signing-readiness.mjs" &&
    readme.includes("pnpm app-store:signing-readiness") &&
    releasePolicy.includes("pnpm app-store:signing-readiness") &&
    testFlightQa.includes("pnpm app-store:signing-readiness") &&
    appStoreUpload.includes("pnpm app-store:signing-readiness") &&
    appStoreUpload.includes("xcodebuild") &&
    appStoreUpload.includes("xcodebuild -exportArchive") &&
    appStoreUpload.includes("apps/mobile/ios/ExportOptions.app-store-connect.plist") &&
    appStoreUpload.includes("Do not commit keys") &&
    exportOptions.includes("<string>app-store-connect</string>") &&
    exportOptions.includes("<string>upload</string>") &&
    exportOptions.includes("<key>manageAppVersionAndBuildNumber</key>") &&
    exportOptions.includes("<false/>") &&
    !exportOptions.includes("testFlightInternalTestingOnly"),
  "README, release policy, TestFlight QA, upload runbook, and ExportOptions plist must describe the owner-executed App Store Connect upload path."
);

check(
  "App Store plan records remaining external execution honestly",
  appStorePlan.includes("repo preparation complete; external execution pending") &&
    appStorePlan.includes("release re-audit gate") &&
    /Release-time\s+execution\s+still\s+requires\s+final\s+sanitized\s+screenshots/.test(appStorePlan),
  "APP_STORE_PLAN.md must not mark external TestFlight, screenshots, or release re-audit execution as complete."
);

manualGate(
  "Refresh third-party notices against the final lockfile",
  "Before tagging the submitted binary, run pnpm app-store:third-party-audit and manually recheck THIRD_PARTY_NOTICES.md against the final package lock, Stockfish source, and bundled puzzle artifacts."
);
manualGate(
  "Create the public source release tag",
  `Tag the exact commit used for the App Store Connect binary as ${iosReleaseTag} and publish the GitHub release.`
);
manualGate(
  "Approve and publish the exact iOS release notes",
  `Approve ${iosReleaseNotePath} before tagging, copy its store text exactly when App Store Connect exposes the field, and retain publication evidence.`
);
manualGate(
  "Configure Apple signing team and Xcode account",
  "Set APPLE_DEVELOPMENT_TEAM to the 10-character Apple Developer Team ID, ensure Xcode has a valid Apple Developer account in Settings, then run the signed archive command in docs/APP_STORE_UPLOAD.md."
);
manualGate(
  "Capture final sanitized App Store screenshots",
  "Use a release or production-like build for the 6.9-inch, 6.1-inch, and required iPad screenshot sets in docs/STORE_ASSETS.md, then run pnpm app-store:screenshot-audit before upload."
);
manualGate(
  "Record the accessibility metadata decision",
  "Leave every accessibility feature unselected for iPhone and iPad, save https://chessticize.github.io/chessticize-mobile/accessibility/ as the Accessibility URL after deployment, and retain an App Store Connect screenshot or export in issue #416 or #417."
);
const failed = checks.filter((entry) => entry.status === "fail");
const result = {
  status: failed.length === 0 ? "pass" : "fail",
  summary: {
    passed: checks.length - failed.length,
    failed: failed.length,
    manual: manual.length
  },
  checks,
  manual
};

if (outputJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("App Store preflight");
  for (const entry of checks) {
    console.log(`${entry.status === "pass" ? "PASS" : "FAIL"} ${entry.name}`);
    if (entry.status === "fail") {
      console.log(`  ${entry.detail}`);
    }
  }
  console.log("");
  console.log("Manual release gates still required:");
  for (const entry of manual) {
    console.log(`MANUAL ${entry.name}`);
    console.log(`  ${entry.detail}`);
  }
  console.log("");
  console.log(`Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.manual} manual gates.`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
