const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const storeAssetsDoc = fs.readFileSync(path.join(repoRoot, "docs/STORE_ASSETS.md"), "utf8");
const appStorePlan = fs.readFileSync(path.join(repoRoot, "docs/APP_STORE_PLAN.md"), "utf8");
const appStoreMetadata = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/app-store-metadata-en-us-v1.json"), "utf8")
);
const currentIOSReleaseNote = fs.readFileSync(
  path.join(
    repoRoot,
    "docs/releases",
    `${appStoreMetadata.currentVersionWhatsNew.sourceTag}.md`
  ),
  "utf8"
);
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const releaseNotesTemplate = fs.readFileSync(
  path.join(repoRoot, "docs/releases/RELEASE_NOTES_TEMPLATE.md"),
  "utf8"
);
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/mobile/package.json"), "utf8"));
const storeAssetsE2e = fs.readFileSync(path.join(repoRoot, "apps/mobile/e2e/store-assets.e2e.js"), "utf8");
const uiCalibrationRunner = fs.readFileSync(
  path.join(
    repoRoot,
    ".codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh"
  ),
  "utf8"
);
const simulatorOrientationRunnerPath = path.join(
  repoRoot,
  ".codex/skills/chessticize-mobile-ui-calibration/scripts/set-simulator-orientation.sh"
);

function tableValue(field) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = storeAssetsDoc.match(new RegExp(`\\| ${escapedField} \\| \`([^\`]+)\` \\|`));
  if (!match) {
    throw new Error(`Missing store metadata field: ${field}`);
  }
  return match[1];
}

function descriptionBlock() {
  const match = storeAssetsDoc.match(
    /Copy the complete plain-text block below into App Store Connect:\n\n```text\n([\s\S]+?)\n```\n\nThe description/
  );
  if (!match) {
    throw new Error("Missing paste-ready App Store description");
  }
  return match[1];
}

function storeCopyTemplateBlock() {
  const match = releaseNotesTemplate.match(
    /## Store copy \(`en-US`\)\n\n```text\n([\s\S]+?)\n```/
  );
  if (!match) {
    throw new Error("Missing release-note store-copy template");
  }
  return match[1];
}

describe("App Store assets document", () => {
  it("tracks the current release without marketing inferred weaknesses", () => {
    expect(storeAssetsDoc).toContain("1.4 source of truth");
    expect(appStoreMetadata.issue).toBe(413);
    expect(appStoreMetadata.description).toContain("chess puzzle trainer");
    expect(appStoreMetadata.description).toContain("SOLVE PUZZLES WITH INTENT");
    expect(appStoreMetadata.description).toContain("Custom Runs");
    expect(appStoreMetadata.description).not.toContain("Tactical Profile");
    expect(appStoreMetadata.description).not.toContain("weakness");
    expect(appStoreMetadata.promotionalText).not.toContain("Tactical Profile");
    expect(appStoreMetadata.promotionalText).not.toContain("weakness");
  });

  it("keeps canonical metadata and paste-ready copy inside App Store Connect limits", () => {
    const {
      appName,
      subtitle,
      promotionalText,
      keywords,
      description,
      limits
    } = appStoreMetadata;

    expect(appName.decision).toBe("keep");
    expect(appName.value).toBe("Chessticize");
    expect(appName.evaluatedCandidates).toContain("Chessticize: Chess Tactics");
    expect(appName.evaluatedCandidates).toContain("Chessticize: Chess Puzzles");
    expect(Array.from(appName.value)).toHaveLength(11);
    expect(Array.from(appName.value).length).toBeLessThanOrEqual(limits.appNameCharacters);
    expect(subtitle).toBe("Offline Chess Puzzle Trainer");
    expect(Array.from(subtitle).length).toBeLessThanOrEqual(limits.subtitleCharacters);
    expect(Array.from(promotionalText).length).toBeLessThanOrEqual(
      limits.promotionalTextCharacters
    );
    expect(Array.from(description).length).toBeLessThanOrEqual(limits.descriptionCharacters);
    expect(Buffer.byteLength(keywords, "utf8")).toBeLessThanOrEqual(limits.keywordsBytes);

    expect(tableValue("App name")).toBe(appName.value);
    expect(tableValue("Subtitle")).toBe(subtitle);
    expect(tableValue("Promotional text")).toBe(promotionalText);
    expect(tableValue("Keywords")).toBe(keywords);
    expect(descriptionBlock()).toBe(description);
  });

  it("uses concrete puzzle language and a clean keyword field", () => {
    const metadataWords = new Set(
      `${appStoreMetadata.appName.value} ${appStoreMetadata.subtitle}`
        .toLowerCase()
        .split(/\s+/u)
    );
    const keywords = appStoreMetadata.keywords.split(",");

    expect(appStoreMetadata.promotionalText).toContain("chess puzzles");
    expect(appStoreMetadata.description).toContain("chess puzzle trainer");
    expect(keywords).toContain("tactics");
    expect(keywords).toContain("stockfish");
    expect(keywords).toContain("checkmate");
    expect(keywords).toContain("open source");
    expect(keywords).not.toContain("offline");
    expect(keywords).not.toContain("chess");
    expect(keywords).not.toContain("puzzle");
    expect(keywords).not.toContain("trainer");
    expect(new Set(keywords).size).toBe(keywords.length);
    expect(keywords.every((keyword) => keyword.length > 2)).toBe(true);
    expect(keywords.some((keyword) => metadataWords.has(keyword))).toBe(false);
    expect(appStoreMetadata.keywords).not.toMatch(/,\s/u);
  });

  it("keeps reusable What's New copy benefit-first and free of raw URLs", () => {
    const template = appStoreMetadata.whatsNewTemplate;
    const currentVersion = appStoreMetadata.currentVersionWhatsNew;
    const draft = currentVersion.storeCopy;

    expect(template.storeCopy).toBe(storeCopyTemplateBlock());
    expect(template.rules).toContain("Use two or three short bullets and no raw URLs.");
    expect(currentVersion.sourceTag).toBe("ios-v1.4.0-build-1");
    expect(currentVersion.status).toBe("release-candidate");
    expect(template.storeCopy).not.toMatch(/https?:\/\//u);
    expect(draft).not.toMatch(/https?:\/\//u);
    expect(draft).not.toContain("experimental");
    expect(draft).not.toContain("Tactical Profile");
    expect(currentIOSReleaseNote).toContain(draft);
    expect(Array.from(draft).length).toBeLessThanOrEqual(
      appStoreMetadata.limits.chessticizeWhatsNewCharacters
    );
  });

  it("points required public URLs at the public repository artifacts", () => {
    expect(tableValue("Support URL")).toBe(
      "https://chessticize.github.io/chessticize-mobile/support/"
    );
    expect(tableValue("Marketing URL")).toBe(
      "https://chessticize.github.io/chessticize-mobile/"
    );
    expect(tableValue("Privacy policy URL")).toBe(
      "https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md"
    );
    expect(readme).toContain("## Support");
    expect(readme).toContain("https://github.com/Chessticize/chessticize-mobile/issues");
    expect(readme).toContain("support@chessticize.com");
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
    expect(storeAssetsE2e).toContain("CHESSTICIZE_STORE_ASSET_ORIENTATION");
    expect(storeAssetsE2e).toContain(
      "Landscape iOS capture requires a dedicated iPad Simulator"
    );
    expect(storeAssetsE2e).toContain(
      "ordinary full-screen iPhone capture is portrait-only"
    );
    expect(storeAssetsE2e).toContain("chessticizeStoreAssetCapture");
    expect(storeAssetsE2e).toContain("setStoreAssetRatings({ standard: 800, arrowDuel: 850 })");
    expect(storeAssetsE2e).toContain("ratingText === '600'");
    expect(storeAssetsE2e).not.toContain("ratingText === 'Rating 600'");
    expect(storeAssetsE2e).toContain("openTab('practice-tab', 'practice-run-home-edit')");
    expect(storeAssetsE2e).not.toContain("openTab('practice-tab', 'practice-run-management')");
    expect(storeAssetsE2e).toContain(
      "waitFor(element(by.id('practice-run-name-input'))).toBeVisible().withTimeout(10000)"
    );
    expect(storeAssetsE2e).toContain("by.id('practice-run-theme-row')");
    expect(storeAssetsE2e).not.toContain("by.id('custom-theme-row')");
    expect(storeAssetsE2e).toContain("toHaveText('1 / 3')");
    expect(storeAssetsE2e).toContain("openTab('history-tab', 'history-filter-toggle')");
    expect(storeAssetsE2e).toContain("by.id('history-page-next')");
    expect(storeAssetsE2e).toContain("app-store-01-practice-tab");
    expect(storeAssetsE2e).toContain("app-store-06-arrow-duel");
    expect(storeAssetsE2e).toContain("app-store-07-custom-setup");
    expect(storeAssetsE2e).toContain("app-store-08-review-session");
    expect(storeAssetsE2e).toContain("app-store-09-sprint-rules-guide");
    expect(storeAssetsE2e).toContain("app-store-10-active-session-guide-header");
    expect(storeAssetsE2e).toContain("app-store-11-active-session-guide-slow");
    expect(storeAssetsE2e).toContain("app-store-12-active-session-guide-timeout");
    expect(storeAssetsE2e).toContain("app-store-13-active-session-guide-unclear");
    expect(storeAssetsE2e).toContain("app-store-14-arrow-duel-guide");
    expect(storeAssetsE2e).toContain("app-store-15-sprint-result");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-01-practice-tab')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-05-standard-sprint')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-06-arrow-duel')");
    expect(storeAssetsE2e).toContain(
      "'app-store-08-review-session',\n    assertReviewLandscapeLayout"
    );
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('review-session-adaptive-layout')))");
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('review-session-board-lane')))");
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('board-coordinate-overlay')))");
    expect(storeAssetsE2e).toContain("element(by.id('review-arrow-duel-candidate-overlay'))");
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('review-exit')))");
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('review-progress')))");
    expect(storeAssetsE2e).toContain("frameFor(element(by.id('review-timer')))");
    expect(storeAssetsE2e).toContain("expectFrameContained(boardFrame, boardLaneFrame");
    expect(storeAssetsE2e).toContain("expectFrameContained(coordinateFrame, boardFrame");
    expect(storeAssetsE2e).toContain("expectFrameContained(candidateArrowFrame, boardFrame");
    expect(storeAssetsE2e).toContain("boardRight > controlRailFrame.x + 1");
    expect(storeAssetsE2e).toContain("takePortraitScreenshotAtTop('app-store-05-standard-sprint')");
    expect(storeAssetsE2e).toContain("takePortraitScreenshotAtTop('app-store-06-arrow-duel')");
    expect(storeAssetsE2e).toContain("takePortraitScreenshotAtTop('app-store-08-review-session')");
    expect(storeAssetsE2e).not.toContain("device.setOrientation(");
    expect(storeAssetsE2e).toContain("by.id('practice-sprint-rules-dismiss')");
    expect(storeAssetsE2e).toContain("by.id('practice-active-session-guide')");
    expect(storeAssetsE2e).toContain("by.id('practice-arrow-duel-guide')");
    expect(storeAssetsE2e).toContain(
      "by.id('practice-session-guide-coach-copy-arrow-duel-reply')"
    );
    expect(storeAssetsE2e).toContain("by.id('practice-session-guide-start')");
    expect(storeAssetsE2e).toContain("takeLandscapeScreenshot('app-store-15-sprint-result')");
    expect(storeAssetsE2e).toContain("waitForScreenOrientation('landscape')");
    expect(storeAssetsE2e).toContain("waitForScreenOrientation('portrait')");
    expect(storeAssetsE2e).toContain("accessibilityLabelFromAttributes");
    expect(storeAssetsE2e).toContain("expectedLayoutClassSuffix");
    expect(storeAssetsE2e).toContain("lastLayoutLabel.endsWith(expectedLayoutClassSuffix)");
    expect(storeAssetsE2e).toContain("last observed frame=${JSON.stringify(lastFrame)}");
    expect(storeAssetsE2e).toContain("last observed layout label=${JSON.stringify(lastLayoutLabel)}");
    expect(storeAssetsE2e).toContain("stableFrameCount >= 3");
    expect(storeAssetsE2e).toContain("last frame error=${lastFrameError");
    expect(uiCalibrationRunner).toContain("CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait");
    expect(uiCalibrationRunner).toContain("CHESSTICIZE_STORE_ASSET_ORIENTATION=landscape");
    expect(uiCalibrationRunner).toContain("set-simulator-orientation.sh");
    expect(uiCalibrationRunner).toContain(
      'DEVICE_NAME="${DETOX_IOS_DEVICE:-iPad Pro 11-inch (M5)}"'
    );
    expect(uiCalibrationRunner).toContain(
      'Full portrait/landscape calibration requires a dedicated iPad Simulator'
    );
    expect(uiCalibrationRunner).toContain('release-$DEVICE_SLUG');
    expect(fs.existsSync(simulatorOrientationRunnerPath)).toBe(true);
    expect(storeAssetsE2e).toContain("expect(element(by.text('Themes'))).toExist()");
    expect(storeAssetsDoc).toContain("pnpm mobile:e2e:build:ios:release");
    expect(storeAssetsDoc).toContain("pnpm mobile:e2e:store-assets:ios:release");
    expect(storeAssetsDoc).toContain("capture-release-baseline.sh");
    expect(storeAssetsDoc).toContain("CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait");
    expect(storeAssetsDoc).toContain("CHESSTICIZE_STORE_ASSET_ORIENTATION=landscape");
    expect(storeAssetsDoc).not.toContain("CHESSTICIZE_CAPTURE_LANDSCAPE_ASSETS");
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
    expect(storeAssetsDoc).toContain("app-store-09-sprint-rules-guide");
    expect(storeAssetsDoc).toContain("app-store-14-arrow-duel-guide");
    expect(storeAssetsDoc).toContain("app-store-15-sprint-result");
    expect(storeAssetsDoc).toContain("capture flow does not");
    expect(storeAssetsDoc).toContain("physical-device build");
  });

  it("verifies portrait orientation before every portrait store-asset screenshot", () => {
    const portraitAtTopHelperStart = storeAssetsE2e.indexOf(
      "async function takePortraitScreenshotAtTop(name)"
    );
    const portraitHelperStart = storeAssetsE2e.indexOf(
      "async function takePortraitScreenshot(name)",
      portraitAtTopHelperStart
    );
    const landscapeHelperStart = storeAssetsE2e.indexOf(
      "async function takeLandscapeScreenshot",
      portraitHelperStart
    );
    const portraitAtTopHelper = storeAssetsE2e.slice(
      portraitAtTopHelperStart,
      portraitHelperStart
    );
    const portraitHelper = storeAssetsE2e.slice(portraitHelperStart, landscapeHelperStart);
    const captureGuard = "if (!capturePortraitAssets)";
    const restoreTop = "await element(by.id('practice-main-scroll')).scrollTo('top')";
    const delegateScreenshot = "await takePortraitScreenshot(name)";
    const waitForPortrait = "await waitForScreenOrientation('portrait')";
    const takeScreenshot = "await device.takeScreenshot(name)";

    expect(storeAssetsE2e.match(/takePortraitScreenshotAtTop\('app-store-/g)).toHaveLength(11);
    expect(storeAssetsE2e).toContain("takePortraitScreenshotAtTop(scene)");
    expect(storeAssetsE2e).not.toMatch(/device\.takeScreenshot\('app-store-/);
    expect(storeAssetsE2e).not.toContain("device.setOrientation(");
    expect(portraitAtTopHelper.indexOf(captureGuard)).toBeGreaterThan(-1);
    expect(portraitAtTopHelper.indexOf(restoreTop)).toBeGreaterThan(
      portraitAtTopHelper.indexOf(captureGuard)
    );
    expect(portraitAtTopHelper.indexOf(delegateScreenshot)).toBeGreaterThan(
      portraitAtTopHelper.indexOf(restoreTop)
    );
    expect(portraitHelper.indexOf(captureGuard)).toBeGreaterThan(-1);
    expect(portraitHelper.indexOf(waitForPortrait)).toBeGreaterThan(
      portraitHelper.indexOf(captureGuard)
    );
    expect(portraitHelper.indexOf(takeScreenshot)).toBeGreaterThan(
      portraitHelper.indexOf(waitForPortrait)
    );
  });

  it("settles the landscape editor after dismissing the number pad before saving", () => {
    const ratingHelperStart = storeAssetsE2e.indexOf(
      "async function setStoreAssetRatings"
    );
    const ratingHelperEnd = storeAssetsE2e.indexOf(
      "async function failArrowDuelSprint",
      ratingHelperStart
    );
    const ratingHelper = storeAssetsE2e.slice(ratingHelperStart, ratingHelperEnd);
    expect(ratingHelper).toContain(
      "await element(by.id('practice-main-scroll')).scrollTo('top');\n"
      + "    await sleep(500);\n"
      + "    await element(by.id('practice-main-scroll')).scrollTo('top');\n"
      + "    await waitFor(element(by.id('practice-run-editor-title')))\n"
      + "      .toBeVisible()\n"
      + "      .withTimeout(5000);\n"
      + "    await element(by.id('practice-run-save')).tap();"
    );
    expect(ratingHelper).not.toContain(
      "await element(by.id('practice-run-name-input')).tap();"
    );
    expect(ratingHelper).not.toContain(
      "await dismissRunNameKeyboard();"
    );
    expect(ratingHelper).not.toContain(
      "await waitFor(element(by.id('practice-run-save')))"
    );

    const reviewHelperStart = storeAssetsE2e.indexOf(
      "async function completeOneWrongReview"
    );
    const reviewHelperEnd = storeAssetsE2e.indexOf(
      "async function captureMainTabScenes",
      reviewHelperStart
    );
    const reviewHelper = storeAssetsE2e.slice(reviewHelperStart, reviewHelperEnd);
    expect(reviewHelper).toContain(
      "await waitForVisibleInPracticeScroll('review-reminder-permission-dismiss');\n"
      + "  await element(by.id('review-reminder-permission-dismiss')).tap();"
    );
  });

  it("marks the App Store plan store-assets item implementation complete", () => {
    expect(appStorePlan).toContain("`docs/STORE_ASSETS.md` now records");
    expect(appStorePlan).toMatch(
      /Release-time\s+execution\s+still\s+requires\s+final\s+sanitized\s+screenshots/
    );
  });
});
