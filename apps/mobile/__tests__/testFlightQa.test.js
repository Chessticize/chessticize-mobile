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
  it("keeps TestFlight execution honest about external Apple/device requirements", () => {
    expect(testFlightDoc).toContain("App Store Connect build");
    expect(testFlightDoc).toContain("internal testing group");
    expect(testFlightDoc).toContain("physical iPhone");
    expect(testFlightDoc).toContain("TestFlight app");
    expect(testFlightDoc).toContain("Do not count simulator-only testing");
  });

  it("covers the required product flows for the physical-device pass", () => {
    const requiredSections = [
      "Install And Launch",
      "Standard Sprint",
      "Arrow Duel",
      "Post-Sprint Mistake Review",
      "History",
      "Scheduled Review",
      "Settings And Local Data",
      "Persistence And Relaunch",
      "Offline Practice"
    ];

    for (const section of requiredSections) {
      expect(testFlightDoc).toContain(`### ${section}`);
    }
  });

  it("requires preflight automation before upload", () => {
    const requiredCommands = [
      "pnpm app-store:preflight",
      "pnpm test",
      "pnpm typecheck",
      "pnpm mobile:test",
      "pnpm mobile:typecheck",
      "pnpm mobile:doctor:ios",
      "pnpm mobile:e2e:build:ios",
      "pnpm mobile:e2e:test:ios"
    ];

    for (const command of requiredCommands) {
      expect(testFlightDoc).toContain(command);
    }
  });

  it("requires evidence before the App Store plan item can be completed", () => {
    expect(testFlightDoc).toContain("## Evidence Log");
    expect(testFlightDoc).toContain("## Completion Rule");
    expect(testFlightDoc).toContain("Release tag");
    expect(testFlightDoc).toContain("Result | Pending");
    expect(appStorePlan).toContain("repo preparation complete; external execution pending");
    expect(appStorePlan).toContain("filled evidence log before this item can be marked complete");
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
    expect(appStoreUploadDoc).toContain("-exportArchive");
    expect(appStoreUploadDoc).toContain("apps/mobile/ios/ExportOptions.app-store-connect.plist");
    expect(appStoreUploadDoc).toContain("Internal 1.0 QA");
    expect(appStoreUploadDoc).toContain("Do not commit keys");
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
    expect(readme).toContain("[TestFlight QA](docs/TESTFLIGHT_QA.md)");
  });
});
