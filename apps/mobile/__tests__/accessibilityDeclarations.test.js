const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const contract = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/app-store-accessibility-v1.json"), "utf8")
);
const audit = fs.readFileSync(path.join(repoRoot, "docs/ACCESSIBILITY_AUDIT.md"), "utf8");
const storeAssets = fs.readFileSync(path.join(repoRoot, "docs/STORE_ASSETS.md"), "utf8");
const accessibilityPage = fs.readFileSync(
  path.join(repoRoot, "site/accessibility/index.html"),
  "utf8"
);
const accessibilityPageText = accessibilityPage.replace(/\s+/gu, " ");

describe("App Store accessibility declarations", () => {
  it("keeps every current feature undeclared on both device families", () => {
    expect(contract.issue).toBe(416);
    expect(contract.appSourceCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(contract.publicationDecision.status).toBe("no-declarations-ready");
    expect(contract.publicationDecision.iphoneDeclarations).toEqual([]);
    expect(contract.publicationDecision.ipadDeclarations).toEqual([]);

    expect(Object.values(contract.features).every(({ status }) => status === "not-declared")).toBe(true);
  });

  it("records every related issue and the current remediation status", () => {
    expect(contract.features.voiceOver.relatedIssues).toEqual([426]);
    expect(contract.features.voiceControl.relatedIssues).toEqual([426]);
    expect(contract.features.largerText.relatedIssues).toEqual([427]);
    expect(contract.features.sufficientContrast.relatedIssues).toEqual([428]);
    expect(contract.additionalFindings.touchTargets.relatedIssues).toEqual([429]);
    expect(contract.features.reducedMotion.relatedIssues).toEqual([430]);
    expect(contract.features.darkInterface.relatedIssues).toEqual([431]);
    expect(contract.features.differentiateWithoutColorAlone.relatedIssues).toEqual([432]);
    expect(contract.remediationPolicy).toEqual(expect.objectContaining({
      status: "demand-driven-deferral",
      decidedOn: "2026-07-31",
      closedIssues: [426, 427, 428, 429, 430, 431, 432]
    }));
    expect(contract.remediationPolicy.reopenSignal).toContain("puzzle flow, device, and assistive setting");
    expect(JSON.stringify(contract)).not.toContain("followUpIssues");
  });

  it("documents the board, text, contrast, touch, motion, and appearance evidence", () => {
    expect(audit).toContain("Declare **no accessibility features**");
    expect(audit).toContain("Standard, Arrow Duel, Review, and Replay");
    expect(audit).toContain("2.15:1");
    expect(audit).toContain("3.30:1");
    expect(audit).toContain("34pt");
    expect(audit).toContain("44pt");
    expect(audit).toContain("landscape-first");
    expect(audit).toContain("owner-operated external gate");
  });

  it("publishes one puzzle-specific accessibility URL without overstating support", () => {
    expect(contract.accessibilityUrl).toBe(
      "https://chessticize.github.io/chessticize-mobile/accessibility/"
    );
    expect(storeAssets).toContain(contract.accessibilityUrl);
    expect(accessibilityPage).toContain("common chess puzzle task");
    expect(accessibilityPage).toContain("not declared in the App Store");
    expect(accessibilityPage).toContain("not currently scheduled");
    expect(accessibilityPage).toContain("closed as not planned");
    expect(accessibilityPage).toContain("does not change the current app");
    expect(accessibilityPageText).toContain("No color-only blocker has been confirmed");
    expect(accessibilityPageText).toContain("complete grayscale common-task walkthrough is still pending");
    expect(accessibilityPage).toContain("does not collect usage analytics");
    expect(accessibilityPage.match(/simple-page-section/g)).toHaveLength(2);
    expect(accessibilityPage).not.toContain("We will");
    expect(accessibilityPage).not.toContain("demonstrated user demand");
    expect(accessibilityPage).not.toContain("fully accessible");
    expect(accessibilityPage).not.toContain("supports VoiceOver");
  });
});
