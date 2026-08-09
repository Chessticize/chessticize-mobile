const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = join(__dirname, "../../..");
const manifest = require("../../../fixtures/puzzles/bundled-core-pack.manifest.json");

describe("bundled puzzle pack native asset", () => {
  it("packages the generated SQLite puzzle pack for iOS and Android", () => {
    const iosProject = readFileSync(
      join(repoRoot, "apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj"),
      "utf8"
    );
    const iosMetadata = readFileSync(
      join(repoRoot, "apps/mobile/ios/ChessticizeMobile/ApplicationMetadata.m"),
      "utf8"
    );
    const iosVersionScript = readFileSync(
      join(repoRoot, "apps/mobile/scripts/ios-version-core-pack-resource.sh"),
      "utf8"
    );
    const androidBuild = readFileSync(join(repoRoot, "apps/mobile/android/app/build.gradle"), "utf8");

    expect(iosProject).toContain("bundled-core-pack.sqlite in Resources");
    expect(iosProject).toContain("../../../fixtures/puzzles/bundled-core-pack.sqlite");
    expect(iosProject).toContain("Version bundled Core Pack resource");
    expect(iosProject).toContain("ios-version-core-pack-resource.sh");
    expect(iosMetadata).toContain('bundleResourcePath');
    expect(iosVersionScript).toContain('"packVersion"');
    expect(iosVersionScript).toContain("bundled-core-pack-v${pack_version}.sqlite");
    expect(androidBuild).toContain("GenerateChessticizeAssets");
    expect(androidBuild).toContain("fixtures/puzzles/bundled-core-pack.sqlite");
    expect(androidBuild).toContain("variant.sources.assets.addGeneratedSourceDirectory");
    expect(androidBuild).toContain("puzzlePack.set(puzzlePackSource)");
    expect(androidBuild).toContain(
      'def puzzlePackAssetFileName = "bundled-core-pack-v${puzzlePackManifest.packVersion}.sqlite"'
    );
    expect(manifest.packVersion).toBe(5);
  });

  it("versions the copied iOS resource and removes an obsolete version", () => {
    const temporaryBuildDirectory = mkdtempSync(join(tmpdir(), "core-pack-ios-resource-"));
    const resourcesDirectory = join(temporaryBuildDirectory, "ChessticizeMobile.app");
    const legacyResource = join(resourcesDirectory, "bundled-core-pack.sqlite");
    const obsoleteResource = join(resourcesDirectory, "bundled-core-pack-v4.sqlite");
    const currentResource = join(
      resourcesDirectory,
      `bundled-core-pack-v${manifest.packVersion}.sqlite`
    );

    try {
      mkdirSync(resourcesDirectory, { recursive: true });
      writeFileSync(legacyResource, "current pack");
      writeFileSync(obsoleteResource, "old pack");

      const result = spawnSync(
        "/bin/bash",
        [join(repoRoot, "apps/mobile/scripts/ios-version-core-pack-resource.sh")],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            SRCROOT: join(repoRoot, "apps/mobile/ios"),
            TARGET_BUILD_DIR: temporaryBuildDirectory,
            UNLOCALIZED_RESOURCES_FOLDER_PATH: "ChessticizeMobile.app"
          }
        }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(existsSync(legacyResource)).toBe(false);
      expect(existsSync(obsoleteResource)).toBe(false);
      expect(existsSync(currentResource)).toBe(true);
    } finally {
      rmSync(temporaryBuildDirectory, { recursive: true, force: true });
    }
  });
});
