const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const storeAssetsDoc = fs.readFileSync(path.join(repoRoot, "docs/STORE_ASSETS.md"), "utf8");
const appStorePlan = fs.readFileSync(path.join(repoRoot, "docs/APP_STORE_PLAN.md"), "utf8");
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/mobile/package.json"), "utf8"));
const storeAssetsE2e = fs.readFileSync(path.join(repoRoot, "apps/mobile/e2e/store-assets.e2e.js"), "utf8");

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
    expect(storeAssetsDoc).toContain("2064 x 2752");
    expect(storeAssetsDoc).toContain("Standard Puzzle Sprint");
    expect(storeAssetsDoc).toContain("Arrow Duel");
    expect(storeAssetsDoc).toContain("Practice tab");
    expect(storeAssetsDoc).toContain("Review tab");
    expect(storeAssetsDoc).toContain("History");
    expect(storeAssetsDoc).toContain("Settings tab");
  });

  it("documents and gates the opt-in screenshot capture flow", () => {
    expect(rootPackage.scripts["mobile:e2e:store-assets:ios"]).toContain("e2e:store-assets:ios");
    expect(rootPackage.scripts["mobile:e2e:build:ios:release"]).toContain("e2e:build:ios:release");
    expect(rootPackage.scripts["mobile:e2e:store-assets:ios:release"]).toContain(
      "e2e:store-assets:ios:release"
    );
    expect(rootPackage.scripts["app-store:screenshot-audit"]).toBe("node scripts/app-store-screenshot-audit.mjs");
    expect(mobilePackage.scripts["e2e:store-assets:ios"]).toContain("CHESSTICIZE_CAPTURE_STORE_ASSETS=1");
    expect(mobilePackage.scripts["e2e:build:ios:release"]).toContain("ios.sim.release");
    expect(mobilePackage.scripts["e2e:store-assets:ios:release"]).toContain("CHESSTICIZE_CAPTURE_STORE_ASSETS=1");
    expect(mobilePackage.scripts["e2e:store-assets:ios:release"]).toContain("ios.sim.release");
    expect(mobilePackage.scripts["e2e:store-assets:ios"]).toContain("e2e/store-assets.e2e.js");
    expect(mobilePackage.scripts["e2e:store-assets:ios"]).toContain("artifacts/store-assets");
    expect(storeAssetsE2e).toContain("describe.skip");
    expect(storeAssetsE2e).toContain("CHESSTICIZE_CAPTURE_STORE_ASSETS");
    expect(storeAssetsE2e).toContain("CHESSTICIZE_CAPTURE_LANDSCAPE_ASSETS");
    expect(storeAssetsE2e).toContain("chessticizeStoreAssetCapture");
    expect(storeAssetsE2e).toContain("setStoreAssetRatings({ standard: 800, arrowDuel: 850 })");
    expect(storeAssetsE2e).toContain("openTab('practice-tab', 'practice-run-home-edit')");
    expect(storeAssetsE2e).not.toContain("openTab('practice-tab', 'practice-run-management')");
    expect(storeAssetsE2e).toContain(
      "waitFor(element(by.id('practice-run-name-input'))).toBeVisible().withTimeout(10000)"
    );
    expect(storeAssetsE2e).toContain("by.id('practice-run-theme-row')");
    expect(storeAssetsE2e).not.toContain("by.id('custom-theme-row')");
    expect(storeAssetsE2e).toContain("toHaveText('1 / 3')");
    expect(storeAssetsE2e).toContain("by.text('1-3 of 3')");
    expect(storeAssetsE2e).toContain("app-store-01-practice-tab");
    expect(storeAssetsE2e).toContain("app-store-06-arrow-duel");
    expect(storeAssetsE2e).toContain("app-store-07-custom-setup");
    expect(storeAssetsE2e).toContain("app-store-08-review-session");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-01-practice-tab')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-05-standard-sprint')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-06-arrow-duel')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-08-review-session')");
    expect(storeAssetsE2e).toContain("device.setOrientation('landscape')");
    expect(storeAssetsE2e).toContain("device.setOrientation('portrait')");
    expect(storeAssetsE2e).toContain("expect(element(by.text('Themes'))).toExist()");
    expect(storeAssetsDoc).toContain("pnpm mobile:e2e:build:ios:release");
    expect(storeAssetsDoc).toContain("pnpm mobile:e2e:store-assets:ios:release");
    expect(storeAssetsDoc).toContain("pnpm app-store:screenshot-audit");
    expect(storeAssetsDoc).toContain("deterministic active-player profile");
    expect(storeAssetsDoc).toContain("two reviews still due plus one completed-today result");
    expect(storeAssetsDoc).toContain("scratch/store-assets/final/");
    expect(storeAssetsDoc).toContain("iphone-6.9");
    expect(storeAssetsDoc).toContain("iphone-6.1");
    expect(storeAssetsDoc).toContain("ipad-13");
    expect(storeAssetsDoc).toContain("app-store-04-settings-tab");
    expect(storeAssetsDoc).toContain("app-store-05-standard-sprint");
    expect(storeAssetsDoc).toContain("app-store-07-custom-setup");
    expect(storeAssetsDoc).toContain("app-store-08-review-session");
  });

  it("marks the App Store plan store-assets item implementation complete", () => {
    expect(appStorePlan).toContain("`docs/STORE_ASSETS.md` now records");
    expect(appStorePlan).toMatch(
      /Release-time\s+execution\s+still\s+requires\s+final\s+sanitized\s+screenshots/
    );
  });
});
