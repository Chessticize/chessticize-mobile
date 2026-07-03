const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const storeAssetsDoc = fs.readFileSync(path.join(repoRoot, "docs/STORE_ASSETS.md"), "utf8");
const appStorePlan = fs.readFileSync(path.join(repoRoot, "docs/APP_STORE_PLAN.md"), "utf8");
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");

function tableValue(field) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = storeAssetsDoc.match(new RegExp(`\\| ${escapedField} \\| \`([^\`]+)\` \\|`));
  if (!match) {
    throw new Error(`Missing store metadata field: ${field}`);
  }
  return match[1];
}

describe("App Store assets document", () => {
  it("keeps required metadata inside App Store Connect limits", () => {
    expect(tableValue("App name")).toBe("Chessticize");
    expect(tableValue("Subtitle").length).toBeLessThanOrEqual(30);
    expect(tableValue("Promotional text").length).toBeLessThanOrEqual(170);
    expect(Buffer.byteLength(tableValue("Keywords"), "utf8")).toBeLessThanOrEqual(100);
  });

  it("points required public URLs at the public repository artifacts", () => {
    expect(tableValue("Support URL")).toBe("https://github.com/Chessticize/chessticize-mobile");
    expect(tableValue("Marketing URL")).toBe("https://github.com/Chessticize/chessticize-mobile");
    expect(tableValue("Privacy policy URL")).toBe(
      "https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md"
    );
    expect(readme).toContain("## Support");
    expect(readme).toContain("https://github.com/Chessticize/chessticize-mobile/issues");
  });

  it("documents the required screenshot groups and screenshot scenes", () => {
    expect(storeAssetsDoc).toContain("6.9\"");
    expect(storeAssetsDoc).toContain("6.1\"");
    expect(storeAssetsDoc).toContain("1290 x 2796");
    expect(storeAssetsDoc).toContain("1170 x 2532");
    expect(storeAssetsDoc).toContain("Standard Puzzle Sprint");
    expect(storeAssetsDoc).toContain("Arrow Duel");
    expect(storeAssetsDoc).toContain("Analysis panel");
    expect(storeAssetsDoc).toContain("History");
  });

  it("marks the App Store plan store-assets item implementation complete", () => {
    expect(appStorePlan).toContain("`docs/STORE_ASSETS.md` now records");
    expect(appStorePlan).toMatch(
      /Release-time\s+execution\s+still\s+requires\s+final\s+sanitized\s+screenshots/
    );
  });
});
