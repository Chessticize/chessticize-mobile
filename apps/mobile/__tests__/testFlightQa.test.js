const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const testFlightDoc = fs.readFileSync(path.join(repoRoot, "docs/TESTFLIGHT_QA.md"), "utf8");
const appStoreUploadDoc = fs.readFileSync(path.join(repoRoot, "docs/APP_STORE_UPLOAD.md"), "utf8");
const appStorePlan = fs.readFileSync(path.join(repoRoot, "docs/APP_STORE_PLAN.md"), "utf8");
const releasePolicy = fs.readFileSync(path.join(repoRoot, "docs/RELEASE_SOURCE_POLICY.md"), "utf8");
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const exportOptions = fs.readFileSync(
  path.join(repoRoot, "apps/mobile/ios/ExportOptions.app-store-connect.plist"),
  "utf8"
);

describe("TestFlight QA checklist", () => {
  it("keeps TestFlight physical-device diagnostics explicitly optional", () => {
    expect(testFlightDoc).toContain("Optional TestFlight Diagnostics");
    expect(testFlightDoc).toContain("Internal 1.3.5 QA");
    expect(testFlightDoc).toContain("ios-v1.3.5-build-2");
    expect(testFlightDoc).toContain("App Store Connect build");
    expect(testFlightDoc).toContain("not an App Store release gate");
    expect(testFlightDoc).toContain("not required");
    expect(testFlightDoc).toContain("TestFlight app");
    expect(testFlightDoc).toContain("CI and simulator/Detox evidence");
  });

  it("preserves optional diagnostic product flows without making them release gates", () => {
    const requiredSections = [
      "Install And Launch",
      "Standard Sprint",
      "Arrow Duel",
      "Post-Sprint Mistake Review",
      "History",
      "Scheduled Review",
      "Settings",
      "Persistence And Relaunch",
      "Offline Practice"
    ];

    for (const section of requiredSections) {
      expect(testFlightDoc).toContain(`### ${section}`);
    }
    expect(testFlightDoc).toContain("Unchecked items do not block App Store submission");
  });

  it("requires exact-candidate fast checks and reusable risk-scoped native validation before upload", () => {
    const requiredCommands = [
      "pnpm app-store:preflight",
      "pnpm test",
      "pnpm typecheck",
      "pnpm mobile:test",
      "pnpm mobile:typecheck"
    ];

    for (const command of requiredCommands) {
      expect(testFlightDoc).toContain(command);
    }

    for (const document of [testFlightDoc, appStoreUploadDoc, releasePolicy]) {
      expect(document).toContain("exact");
      expect(document).toMatch(/delta/i);
      expect(document).toMatch(/targeted/i);
      expect(document).toMatch(/broad/i);
    }

    for (const document of [appStoreUploadDoc, releasePolicy]) {
      expect(document).toContain("`flows`");
      expect(document).toContain("`practice`");
    }

    expect(testFlightDoc).toContain("affected Detox suite");
    expect(testFlightDoc).toMatch(/both suites only for\s+broad native risk/);
    expect(appStoreUploadDoc).toMatch(
      /does not require\s+a\s+fresh\s+full\s+Detox\s+run/
    );
    expect(releasePolicy).toMatch(
      /Ordinary deltas use exact-head fast checks plus the platform's signed-artifact/
    );
    for (const document of [appStoreUploadDoc, releasePolicy]) {
      expect(document).toMatch(/App\s+source SHA/);
      expect(document).toMatch(/test-runner\s+SHA/);
      expect(document).toContain("App-input digest");
      expect(document).toMatch(/documentation,\s+review\s+metadata/i);
    }
  });

  it("requires evidence before the App Store plan item can be completed", () => {
    expect(testFlightDoc).toContain("## Evidence Log");
    expect(testFlightDoc).toContain("## Release Rule");
    expect(testFlightDoc).toContain("Release tag");
    expect(testFlightDoc).toContain("Result | Pending");
    expect(appStorePlan).toContain("repo preparation complete; external execution pending");
    expect(appStorePlan).toContain("not an internal TestFlight group or physical-device pass");
  });

  it("documents the owner-executed App Store archive and upload path", () => {
    expect(readme).toContain("[App Store Upload](docs/APP_STORE_UPLOAD.md)");
    expect(testFlightDoc).toContain("docs/APP_STORE_UPLOAD.md");
    expect(releasePolicy).toContain("docs/APP_STORE_UPLOAD.md");
    expect(appStoreUploadDoc).toContain("xcodebuild");
    expect(appStoreUploadDoc).toContain("-workspace apps/mobile/ios/ChessticizeMobile.xcworkspace");
    expect(appStoreUploadDoc).toContain("-scheme ChessticizeMobile");
    expect(appStoreUploadDoc).toContain("-configuration Release");
    expect(appStoreUploadDoc).toContain("-destination \"generic/platform=iOS\"");
    expect(appStoreUploadDoc).toContain("APPLE_DEVELOPMENT_TEAM");
    expect(appStoreUploadDoc).toContain("DEVELOPMENT_TEAM=\"$APPLE_DEVELOPMENT_TEAM\"");
    expect(appStoreUploadDoc).toContain("-exportArchive");
    expect(appStoreUploadDoc).toContain("apps/mobile/ios/ExportOptions.app-store-connect.plist");
    expect(appStoreUploadDoc).toContain("do not wait for physical-device QA");
    expect(appStoreUploadDoc).toContain("Do not commit keys");
    expect(appStoreUploadDoc).toContain("Signing Troubleshooting");
    expect(appStoreUploadDoc).toContain("requires a development team");
    expect(appStoreUploadDoc).toContain("missing Xcode-Username");
    expect(appStoreUploadDoc).toContain("xcodebuild -version");
    expect(appStoreUploadDoc).toContain("xcrun --sdk iphoneos --show-sdk-version");
    expect(appStoreUploadDoc).toContain("Xcode 26 or later");
    expect(appStoreUploadDoc).toMatch(/iOS\s+and iPadOS 26 SDK or later/);
    expect(appStoreUploadDoc).toContain("on a clean release Mac");
    expect(appStoreUploadDoc).toContain(
      "Repository preparation on another checkout is not native evidence"
    );
    expect(appStoreUploadDoc).toContain(
      "App Store Connect release notes"
    );
    expect(appStoreUploadDoc).toContain(
      "The 1.3.5 candidate is explicitly a **Delta release**"
    );
    expect(appStoreUploadDoc).toContain("a fresh Detox build");
    expect(appStoreUploadDoc).toContain("is not required");
    expect(appStoreUploadDoc).toContain("brew --prefix ruby@3.3");
    expect(appStoreUploadDoc).toContain("requires Homebrew Ruby 3.3");
  });

  it("keeps the App Store Connect export options aligned with the release runbook", () => {
    expect(exportOptions).toContain("<key>method</key>");
    expect(exportOptions).toContain("<string>app-store-connect</string>");
    expect(exportOptions).toContain("<key>destination</key>");
    expect(exportOptions).toContain("<string>upload</string>");
    expect(exportOptions).toContain("<key>manageAppVersionAndBuildNumber</key>");
    expect(exportOptions).toContain("<false/>");
    expect(exportOptions).toContain("<key>uploadSymbols</key>");
    expect(exportOptions).toContain("<true/>");
    expect(exportOptions).not.toContain("testFlightInternalTestingOnly");
  });

  it("links the QA document from the README", () => {
    expect(readme).toContain("[TestFlight Diagnostics](docs/TESTFLIGHT_QA.md)");
  });
});
