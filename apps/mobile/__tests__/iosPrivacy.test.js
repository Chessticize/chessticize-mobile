const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const appRoot = process.cwd();
const repoRoot = join(appRoot, "../..");
const iosRoot = join(appRoot, "ios", "ChessticizeMobile");

function readText(path) {
  return readFileSync(path, "utf8");
}

function extractPrivacyManifestEntries(manifest) {
  const entries = [];
  const pattern =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>([^<]+)<\/string>/g;
  let match;
  while ((match = pattern.exec(manifest)) !== null) {
    entries.push({ category: match[1], reason: match[2] });
  }
  return entries;
}

describe("iOS App Store privacy artifacts", () => {
  it("declares no non-exempt encryption and no unused location prompt", () => {
    const infoPlist = readText(join(iosRoot, "Info.plist"));

    expect(infoPlist).toContain("<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>");
    expect(infoPlist).not.toContain("NSLocationWhenInUseUsageDescription");
  });

  it("keeps the privacy manifest aligned with local-only, no-tracking behavior", () => {
    const manifest = readText(join(iosRoot, "PrivacyInfo.xcprivacy"));
    const entries = extractPrivacyManifestEntries(manifest);

    expect(manifest).toContain("<key>NSPrivacyTracking</key>\n\t<false/>");
    expect(manifest).toContain("<key>NSPrivacyCollectedDataTypes</key>\n\t<array/>");
    expect(entries).toEqual([
      { category: "NSPrivacyAccessedAPICategoryFileTimestamp", reason: "C617.1" },
      { category: "NSPrivacyAccessedAPICategoryUserDefaults", reason: "CA92.1" },
      { category: "NSPrivacyAccessedAPICategorySystemBootTime", reason: "35F9.1" },
    ]);
  });

  it("publishes the App Store privacy disclosure and privacy policy", () => {
    const disclosure = readText(join(repoRoot, "docs", "APP_PRIVACY_DISCLOSURE.md"));
    const policy = readText(join(repoRoot, "docs", "PRIVACY_POLICY.md"));
    const readme = readText(join(repoRoot, "README.md"));

    expect(disclosure).toContain("Data Not Collected");
    expect(disclosure).toContain("Tracking: **No**");
    expect(disclosure).toContain(
      "https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md"
    );
    expect(disclosure).toContain("Re-audit these answers before every App Store submission");
    expect(policy).toContain("Chessticize Mobile does not collect data from the app.");
    expect(policy).toContain("does not track you across apps or websites");
    expect(readme).toContain("[Privacy Policy](docs/PRIVACY_POLICY.md)");
  });
});
