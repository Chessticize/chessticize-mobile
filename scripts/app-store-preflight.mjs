#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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
const storeAssets = readText("docs/STORE_ASSETS.md");
const storeAssetsE2e = readText("apps/mobile/e2e/store-assets.e2e.js");
const testFlightQa = readText("docs/TESTFLIGHT_QA.md");
const privacyDisclosure = readText("docs/APP_PRIVACY_DISCLOSURE.md");
const privacyPolicy = readText("docs/PRIVACY_POLICY.md");
const appStorePlan = readText("docs/APP_STORE_PLAN.md");
const pbxproj = readText("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj");
const infoPlist = readText("apps/mobile/ios/ChessticizeMobile/Info.plist");
const privacyManifest = readText("apps/mobile/ios/ChessticizeMobile/PrivacyInfo.xcprivacy");

const marketingVersions = uniqueMatches(pbxproj, /MARKETING_VERSION = ([^;]+);/g);
const buildNumbers = uniqueMatches(pbxproj, /CURRENT_PROJECT_VERSION = ([^;]+);/g);
const bundleIdentifiers = uniqueMatches(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g);
const deviceFamilies = uniqueMatches(pbxproj, /TARGETED_DEVICE_FAMILY = ([^;]+);/g);
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
  "iOS release identity is fixed for 1.0",
  marketingVersions.length === 1 &&
    marketingVersions[0] === "1.0" &&
    buildNumbers.length === 1 &&
    buildNumbers[0] === "1" &&
    bundleIdentifiers.length === 1 &&
    bundleIdentifiers[0] === "com.chessticize.mobile" &&
    deviceFamilies.length === 1 &&
    deviceFamilies[0] === "1",
  `Found marketingVersions=${marketingVersions.join(",")}, buildNumbers=${buildNumbers.join(",")}, bundleIdentifiers=${bundleIdentifiers.join(",")}, deviceFamilies=${deviceFamilies.join(",")}.`
);

check(
  "Export compliance flag is set",
  infoPlist.includes("<key>ITSAppUsesNonExemptEncryption</key>") &&
    infoPlist.includes("<false/>"),
  "Info.plist must declare ITSAppUsesNonExemptEncryption=false for the local-only 1.0 app."
);

check(
  "Privacy documents stay aligned with local-only behavior",
    privacyDisclosure.includes("Data Not Collected") &&
    privacyDisclosure.includes("Tracking: **No**") &&
    privacyDisclosure.includes("https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md") &&
    privacyPolicy.includes("does not collect data from the app") &&
    privacyPolicy.includes("does not track you") &&
    privacyManifest.includes("<key>NSPrivacyTracking</key>") &&
    privacyManifest.includes("<false/>"),
  "Privacy disclosure, public privacy policy, and iOS privacy manifest must describe no collection and no tracking."
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
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("CHESSTICIZE_CAPTURE_STORE_ASSETS=1") &&
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("e2e/store-assets.e2e.js") &&
    mobilePackage.scripts?.["e2e:store-assets:ios"]?.includes("artifacts/store-assets") &&
    storeAssetsE2e.includes("CHESSTICIZE_CAPTURE_STORE_ASSETS") &&
    storeAssetsE2e.includes("describe.skip") &&
    storeAssetsE2e.includes("app-store-01-practice-home") &&
    storeAssetsE2e.includes("app-store-06-history") &&
    storeAssets.includes("pnpm mobile:e2e:store-assets:ios") &&
    storeAssets.includes("app-store-05-mistake-review-analysis"),
  "Store screenshot capture must stay opt-in, documented, and wired to the named Detox capture spec."
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
  "App Store plan records remaining external execution honestly",
  appStorePlan.includes("repo preparation complete; external execution pending") &&
    appStorePlan.includes("release re-audit gate") &&
    /Release-time\s+execution\s+still\s+requires\s+final\s+sanitized\s+screenshots/.test(appStorePlan),
  "APP_STORE_PLAN.md must not mark external TestFlight, screenshots, or release re-audit execution as complete."
);

manualGate(
  "Refresh third-party notices against the final lockfile",
  "Before tagging the submitted binary, re-audit THIRD_PARTY_NOTICES.md against the final package lock, Stockfish source, and bundled puzzle artifacts."
);
manualGate(
  "Create the public source release tag",
  "Tag the exact commit used for the App Store Connect binary, for example ios-v1.0.0-build-1, and publish the GitHub release."
);
manualGate(
  "Capture final sanitized App Store screenshots",
  "Use a release or production-like build for the 6.9-inch and 6.1-inch screenshot sets in docs/STORE_ASSETS.md."
);
manualGate(
  "Execute the internal TestFlight physical-device pass",
  "Upload the build to App Store Connect, distribute it to Internal 1.0 QA, install from TestFlight on a physical iPhone, and fill docs/TESTFLIGHT_QA.md evidence."
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
