const { existsSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { renderIOSReleaseVersion } = require("../scripts/ios-release-version");

const appRoot = process.cwd();
const iosRoot = join(appRoot, "ios", "ChessticizeMobile");
const releaseVersion = JSON.parse(readText(join(appRoot, "release-version.json")));

function readText(path) {
  return readFileSync(path, "utf8");
}

function expectedPixels(size, scale) {
  const [pointSize] = size.split("x");
  const points = Number(pointSize);
  const multiplier = scale === "3x" ? 3 : scale === "2x" ? 2 : 1;
  return Math.round(points * multiplier);
}

describe("iOS App Store identity artifacts", () => {
  it("uses the public Chessticize app identity instead of the React Native template identity", () => {
    const infoPlist = readText(join(iosRoot, "Info.plist"));
    const project = readText(join(appRoot, "ios", "ChessticizeMobile.xcodeproj", "project.pbxproj"));

    expect(infoPlist).toContain("<key>CFBundleDisplayName</key>\n\t<string>Chessticize</string>");
    expect(infoPlist).toContain("<key>CFBundleShortVersionString</key>\n\t<string>$(MARKETING_VERSION)</string>");
    expect(infoPlist).toContain("<key>CFBundleVersion</key>\n\t<string>$(CURRENT_PROJECT_VERSION)</string>");
    expect(project).toContain("PRODUCT_BUNDLE_IDENTIFIER = com.chessticize.mobile;");
    expect(project).toContain("PRODUCT_NAME = Chessticize;");
    expect(project).toContain("productName = Chessticize;");
    expect(project).toContain("Config/Debug.xcconfig");
    expect(project).toContain("Config/Release.xcconfig");
    expect(project).not.toMatch(/MARKETING_VERSION = \d/);
    expect(project).not.toMatch(/CURRENT_PROJECT_VERSION = \d/);
    expect(project).not.toContain("org.reactjs.native.example");
    expect(project).not.toContain("ChessticizeMobile.app");
  });

  it("derives installed iOS version and build settings from the canonical release version", () => {
    const generatedConfig = readText(join(appRoot, "ios", "Config", "ReleaseVersion.xcconfig"));

    expect(generatedConfig).toBe(renderIOSReleaseVersion(releaseVersion));
    expect(renderIOSReleaseVersion({
      ...releaseVersion,
      iosPublicVersion: "9.8.7",
      iosBuildNumber: 42,
    })).toContain("MARKETING_VERSION = 9.8.7\nCURRENT_PROJECT_VERSION = 42\n");
  });

  it("keeps the launch screen aligned with the app background and reuses the main app logo", () => {
    const launchScreen = readText(join(iosRoot, "LaunchScreen.storyboard"));
    const launchLogo = readFileSync(join(iosRoot, "Images.xcassets", "LaunchLogo.imageset", "LaunchLogo.png"));
    const appLogo = readFileSync(join(iosRoot, "Images.xcassets", "AppIcon.appiconset", "AppIcon-ios-marketing-1024.png"));

    expect(launchScreen).toContain('text="Chessticize"');
    expect(launchScreen).toContain('image="LaunchLogo"');
    expect(launchScreen).not.toContain("ChessticizeMobile");
    expect(launchScreen).not.toContain("Powered by React Native");
    expect(launchScreen).toContain(
      'red="0.97254901960784312" green="0.98039215686274506" blue="0.9882352941176471"'
    );
    expect(launchLogo).toEqual(appLogo);
  });

  it("has concrete no-alpha PNGs for every AppIcon catalog slot", () => {
    const iconDir = join(iosRoot, "Images.xcassets", "AppIcon.appiconset");
    const contents = JSON.parse(readText(join(iconDir, "Contents.json")));

    expect(contents.images.length).toBeGreaterThanOrEqual(18);
    for (const image of contents.images) {
      expect(image.filename).toBeTruthy();
      const iconPath = join(iconDir, image.filename);
      expect(existsSync(iconPath)).toBe(true);
      const png = readFileSync(iconPath);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(expectedPixels(image.size, image.scale));
      expect(png.readUInt32BE(20)).toBe(expectedPixels(image.size, image.scale));
      expect(png[25]).toBe(2);
    }
  });

  it("lets the Detox build wrapper follow the Xcode product name", () => {
    const detoxBuildScript = readText(join(appRoot, "scripts", "ios-build-for-detox.sh"));
    const detoxConfig = readText(join(appRoot, ".detoxrc.js"));

    expect(detoxBuildScript).toContain("-showBuildSettings");
    expect(detoxBuildScript).toContain("TARGET_BUILD_DIR");
    expect(detoxBuildScript).toContain("WRAPPER_NAME");
    expect(detoxBuildScript).not.toContain("ChessticizeMobile.app");
    expect(detoxConfig).toContain("Chessticize.app");
    expect(detoxConfig).not.toContain("ChessticizeMobile.app");
  });

  it("refreshes React Native prebuilt dependencies for a Debug Detox build", () => {
    const detoxBuildScript = readText(join(appRoot, "scripts", "ios-build-for-detox.sh"));

    expect(detoxBuildScript).toContain("force_debug_prebuilt_refresh");
    expect(detoxBuildScript).toContain("React-Core-prebuilt/.last_build_configuration");
    expect(detoxBuildScript).toContain("ReactNativeDependencies/.last_build_configuration");
    expect(detoxBuildScript).toContain("ios/Pods/.last_build_configuration");
    expect(detoxBuildScript).toContain('[[ ! -f "$marker" ]]');
  });

  it("keeps both Detox build paths pinned to the committed CocoaPods lockfile", () => {
    const debugBuildScript = readText(join(appRoot, "scripts", "ios-build-for-detox.sh"));
    const releaseBuildScript = readText(join(appRoot, "scripts", "ios-build-release-for-detox.sh"));
    const lockedInstallScript = readText(
      join(appRoot, "scripts", "ios-install-pods-locked.sh")
    );

    expect(debugBuildScript).toContain("scripts/ios-install-pods-locked.sh");
    expect(releaseBuildScript).toContain("scripts/ios-install-pods-locked.sh");
    expect(lockedInstallScript).toContain(
      "bundle exec pod install --deployment --project-directory=ios"
    );
    expect(lockedInstallScript).toContain("ios/Pods/Manifest.lock");
    expect(lockedInstallScript).toContain("cmp -s");
    expect(lockedInstallScript).toContain("rm -rf ios/Pods");
    expect(lockedInstallScript).toContain("RUBY_VERSION.split");
    expect(lockedInstallScript).toContain('[[ "$ruby_minor" != "3.3" ]]');
    expect(lockedInstallScript).toContain("Ruby 3.3 must be active");
    expect(debugBuildScript).not.toContain("pod update");
    expect(releaseBuildScript).not.toContain("pod update");
    expect(lockedInstallScript).not.toContain("pod update");
  });

  it("keeps GitHub iOS validation JS-only and leaves native release evidence local", () => {
    const workflow = readText(join(appRoot, "..", "..", ".github", "workflows", "mobile-js.yml"));

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("name: Mobile JS checks");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("runs-on: macos-");
    expect(workflow).not.toContain("xcodebuild");
    expect(workflow).not.toContain("Detox iOS");
    expect(workflow).not.toContain("mobile:e2e:build:ios");
  });

  it("keeps the Hermes CocoaPods checksum portable across workspace paths", () => {
    const repositoryRoot = join(appRoot, "..", "..");
    const workspace = readText(join(repositoryRoot, "pnpm-workspace.yaml"));
    const reactNativeRoot = dirname(require.resolve("react-native/package.json"));
    const hermesPodspec = readText(
      join(reactNativeRoot, "sdks", "hermes-engine", "hermes-engine.podspec")
    );

    expect(workspace).toContain(
      "react-native@0.86.0: patches/react-native@0.86.0.patch"
    );
    expect(hermesPodspec).toContain(
      "'HERMES_CLI_PATH' => '${PODS_ROOT}/../../node_modules/hermes-compiler/hermesc/osx-bin/hermesc'"
    );
    expect(hermesPodspec).not.toContain(
      'require.resolve(\\"hermes-compiler\\"'
    );
  });
});
