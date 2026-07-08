const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const appRoot = process.cwd();
const repoRoot = join(appRoot, "../..");
const iosRoot = join(appRoot, "ios", "ChessticizeMobile");

function readText(path) {
  return readFileSync(path, "utf8");
}

function targetBuildSettings(project) {
  const targetSection = project.match(
    /13B07F941A680F5B00A75B9A \/\* Debug \*\/ = {[\s\S]*?13B07F951A680F5B00A75B9A \/\* Release \*\/ = {[\s\S]*?\n\t\t};/
  );
  if (!targetSection) {
    throw new Error("Could not locate ChessticizeMobile target build settings");
  }
  return targetSection[0];
}

describe("iOS device target configuration", () => {
  it("ships 1.0 for iPhone and iPad with the current React Native minimum iOS target", () => {
    const project = readText(join(appRoot, "ios", "ChessticizeMobile.xcodeproj", "project.pbxproj"));
    const settings = targetBuildSettings(project);

    expect(settings.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)).toHaveLength(2);
    expect(settings).not.toContain("TARGETED_DEVICE_FAMILY = 1;");
    expect(settings.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/g)).toHaveLength(2);
  });

  it("supports adaptive iPhone and iPad orientations without the full-screen lock", () => {
    const infoPlist = readText(join(iosRoot, "Info.plist"));

    expect(infoPlist).toContain(
      "<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>"
    );
    expect(infoPlist).toContain(
      "<key>UISupportedInterfaceOrientations~ipad</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>"
    );
    expect(infoPlist).not.toContain("UIRequiresFullScreen");
  });

  it("documents the App Store device target decision", () => {
    const deviceTargets = readText(join(repoRoot, "docs", "DEVICE_TARGETS.md"));
    const readme = readText(join(repoRoot, "README.md"));

    expect(deviceTargets).toContain("Chessticize Mobile 1.0 ships for iPhone portrait and adaptive iPad portrait,");
    expect(deviceTargets).toContain("landscape, and multitasking layouts.");
    expect(deviceTargets).toContain('Device family: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)');
    expect(deviceTargets).toContain("Orientation: iPhone portrait only; iPad portrait, upside-down");
    expect(deviceTargets).toContain("and\n  landscape");
    expect(deviceTargets).toContain("Minimum iOS version: 15.1");
    expect(readme).toContain("[iOS Device Targets](docs/DEVICE_TARGETS.md)");
  });
});
