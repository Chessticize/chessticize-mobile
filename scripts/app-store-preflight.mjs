#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const mobilePackage = readJson("apps/mobile/package.json");
const readme = readText("README.md");
const releasePolicy = readText("docs/RELEASE_SOURCE_POLICY.md");
const appStoreUpload = readText("docs/APP_STORE_UPLOAD.md");
const storeAssets = readText("docs/STORE_ASSETS.md");
const storeAssetsE2e = readText("apps/mobile/e2e/store-assets.e2e.js");
const testFlightQa = readText("docs/TESTFLIGHT_QA.md");
const privacyDisclosure = readText("docs/APP_PRIVACY_DISCLOSURE.md");
const privacyPolicy = readText("docs/PRIVACY_POLICY.md");
const appStorePlan = readText("docs/APP_STORE_PLAN.md");
const pbxproj = readText("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj");
const infoPlist = readText("apps/mobile/ios/ChessticizeMobile/Info.plist");
const privacyManifest = readText("apps/mobile/ios/ChessticizeMobile/PrivacyInfo.xcprivacy");
const entitlements = readText("apps/mobile/ios/ChessticizeMobile/ChessticizeMobile.entitlements");
const exportOptions = readText("apps/mobile/ios/ExportOptions.app-store-connect.plist");
const thirdPartyAudit = spawnSync(
  process.execPath,
  ["scripts/app-store-third-party-audit.mjs", "--json"],
  {
    cwd: repoRoot,
    encoding: "utf8"
  }
);
let thirdPartyAuditPayload = null;
try {
  thirdPartyAuditPayload = JSON.parse(thirdPartyAudit.stdout || "{}");
} catch {
  thirdPartyAuditPayload = null;
}

const marketingVersions = uniqueMatches(pbxproj, /MARKETING_VERSION = ([^;]+);/g);
const buildNumbers = uniqueMatches(pbxproj, /CURRENT_PROJECT_VERSION = ([^;]+);/g);
const bundleIdentifiers = uniqueMatches(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g);
const deviceFamilies = uniqueMatches(pbxproj, /TARGETED_DEVICE_FAMILY = ([^;]+);/g);
const targetedDeviceFamily = deviceFamilies.length === 1 ? unquoteBuildSetting(deviceFamilies[0]) : "";
const iphoneOrientations = plistStringArrayForKey(infoPlist, "UISupportedInterfaceOrientations");
const ipadOrientations = plistStringArrayForKey(infoPlist, "UISupportedInterfaceOrientations~ipad");
const expectedIphoneOrientations = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight"
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
  fileExists("apps/mobile/ios/StockfishEngine/Copying.txt") &&
    fileExists("apps/mobile/ios/StockfishEngine/AUTHORS") &&
    fileExists("apps/mobile/ios/StockfishEngine/README-STOCKFISH.md"),
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
  "iOS release identity is fixed for 1.1",
  marketingVersions.length === 1 &&
    marketingVersions[0] === "1.1" &&
    buildNumbers.length === 1 &&
    buildNumbers[0] === "2" &&
    bundleIdentifiers.length === 1 &&
    bundleIdentifiers[0] === "com.chessticize.mobile" &&
    deviceFamilies.length === 1 &&
    targetedDeviceFamily === "1,2" &&
    !fullScreenLocked &&
    stringArrayEquals(iphoneOrientations, expectedIphoneOrientations) &&
    stringArrayEquals(ipadOrientations, expectedIpadOrientations),
  `Found marketingVersions=${marketingVersions.join(",")}, buildNumbers=${buildNumbers.join(",")}, bundleIdentifiers=${bundleIdentifiers.join(",")}, deviceFamilies=${deviceFamilies.join(",")}, fullScreenLocked=${fullScreenLocked}, iphoneOrientations=${iphoneOrientations.join("|")}, ipadOrientations=${ipadOrientations.join("|")}.`
);

check(
  "Export compliance flag is set",
  infoPlist.includes("<key>ITSAppUsesNonExemptEncryption</key>") &&
    infoPlist.includes("<false/>"),
  "Info.plist must declare ITSAppUsesNonExemptEncryption=false for the 1.1 app."
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
    entitlements.includes("<string>CloudKit</string>") &&
    pbxproj.includes("ICloudProgressSync.m in Sources") &&
    pbxproj.includes("CloudKit.framework in Frameworks"),
  "Privacy disclosure, public privacy policy, iOS privacy manifest, and CloudKit entitlement must describe no collection, no tracking, and optional private iCloud sync."
);

check(
  "Store metadata document contains upload-ready public fields",
  storeAssets.includes("| App name | `Chessticize` |") &&
    storeAssets.includes("| Support URL | `https://github.com/Chessticize/chessticize-mobile` |") &&
    storeAssets.includes("| Privacy policy URL | `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md` |") &&
    storeAssets.includes("6.9\"") &&
    storeAssets.includes("6.1\""),
  "STORE_ASSETS.md must include the public metadata URLs and required screenshot display groups."
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
    storeAssets.includes("pnpm app-store:screenshot-audit") &&
    storeAssets.includes("iphone-6.9") &&
    storeAssets.includes("iphone-6.1") &&
    storeAssets.includes("ipad-13") &&
    storeAssets.includes("pnpm mobile:e2e:store-assets:ios:release") &&
    storeAssets.includes("app-store-04-settings-tab") &&
    storeAssets.includes("app-store-05-standard-sprint"),
  "Store screenshot capture and final artifact audit must stay opt-in, documented, and wired to the named Detox capture spec."
);

check(
  "TestFlight QA checklist is explicit about real-device execution",
  testFlightQa.includes("Do not count simulator-only testing") &&
    testFlightQa.includes("physical iPhone") &&
    testFlightQa.includes("App Store Connect build") &&
    testFlightQa.includes("Result | Pending") &&
    testFlightQa.includes("Completion Rule"),
  "TESTFLIGHT_QA.md must keep the real TestFlight pass separate from simulator preflight evidence."
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
  "Tag the exact commit used for the App Store Connect binary as ios-v1.1.0-build-2 and publish the GitHub release."
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
  "Execute the internal TestFlight physical-device pass",
  "Upload the build to App Store Connect, distribute it to Internal 1.1 QA, install from TestFlight on physical iPhone and iPad hardware, and fill docs/TESTFLIGHT_QA.md evidence."
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
