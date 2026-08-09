const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const repoRoot = join(__dirname, "../../..");
const manifest = require("../../../fixtures/puzzles/bundled-core-pack.manifest.json");

describe("bundled puzzle pack native asset", () => {
  it("packages the generated SQLite puzzle pack for iOS and Android", () => {
    const iosProject = readFileSync(
      join(repoRoot, "apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj"),
      "utf8"
    );
    const androidBuild = readFileSync(join(repoRoot, "apps/mobile/android/app/build.gradle"), "utf8");

    expect(iosProject).toContain(`bundled-core-pack-v${manifest.packVersion}.sqlite in Resources`);
    expect(iosProject).toContain("../../../fixtures/puzzles/bundled-core-pack.sqlite");
    expect(androidBuild).toContain("GenerateChessticizeAssets");
    expect(androidBuild).toContain("fixtures/puzzles/bundled-core-pack.sqlite");
    expect(androidBuild).toContain("variant.sources.assets.addGeneratedSourceDirectory");
    expect(androidBuild).toContain("puzzlePack.set(puzzlePackSource)");
    expect(androidBuild).toContain(
      'def puzzlePackAssetFileName = "bundled-core-pack-v${puzzlePackManifest.packVersion}.sqlite"'
    );
  });
});
