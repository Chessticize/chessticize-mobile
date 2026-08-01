const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const readBuffer = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath));

const homepage = read("site/index.html");
const androidPage = read("site/android/index.html");
const supportPage = read("site/support/index.html");
const accessibilityPage = read("site/accessibility/index.html");
const accessibilityPageText = accessibilityPage.replace(/\s+/gu, " ");
const notFoundPage = read("site/404.html");
const styles = read("site/styles.css");
const readme = read("README.md");
const landingPageDoc = read("docs/LANDING_PAGE.md");
const pagesWorkflow = read(".github/workflows/pages.yml");
const assetGenerator = read("scripts/prepare-landing-page-assets.mjs");
const manifest = JSON.parse(read("site/assets/marketing-assets.json"));

const appStoreUrl =
  "https://apps.apple.com/us/app/chessticize/id6788610123";
const websiteUrl = "https://chessticize.github.io/chessticize-mobile/";
const androidUrl = `${websiteUrl}android/`;
const supportUrl = `${websiteUrl}support/`;
const accessibilityUrl = `${websiteUrl}accessibility/`;
const androidReleaseBase =
  "https://github.com/Chessticize/chessticize-mobile/releases";
const apkUrl =
  `${androidReleaseBase}/download/android-v1.3.0-build-8/` +
  "Chessticize-Android-1.3.apk";
const checksum =
  "29cbfb529a38e215cd7fc6763284618288031c624cbf65cce0e381eafe3bbea0";

describe("public landing page", () => {
  it("uses concrete puzzle language without unshipped personalization claims", () => {
    const publicCopy = [
      homepage,
      androidPage,
      supportPage,
      accessibilityPage,
      readme
    ].join("\n");

    expect(homepage).toContain("chess puzzle trainer");
    expect(homepage).toContain(
      'property="og:title" content="Chessticize — Chess Puzzle Practice"'
    );
    expect(homepage).toContain("rating-matched puzzle Sprints");
    expect(homepage).toContain("Custom Runs");
    expect(homepage).toContain("scheduled Review");
    expect(homepage).toContain("build tactical intuition");
    expect(publicCopy).not.toMatch(/Tactical Profile/i);
    expect(publicCopy).not.toMatch(/\badaptive practice\b/i);
    expect(publicCopy).not.toMatch(/\bweakness(?:es)?\b/i);
  });

  it("leads with offline, ad-free practice and explains Arrow Duel by benefit", () => {
    expect(homepage).toContain("Free · Offline · Ad-free · Open source");
    expect(homepage).toMatch(
      /Learn to reject tempting\s+blunders in Arrow Duel\./
    );
    expect(homepage).toContain(
      "<strong>Blunder prevention</strong> with Arrow Duel"
    );
    expect(homepage).toContain(
      "<strong>Offline</strong><br>No ads"
    );
    expect(homepage).toContain("<h3>Works fully offline</h3>");
    expect(homepage).not.toContain("<strong>Two-move</strong> Arrow Duel");
    expect(homepage).not.toContain("<strong>On-device</strong> Stockfish");
    expect(homepage).not.toContain("<h3>On-device analysis</h3>");

    for (const page of [homepage, androidPage, supportPage, accessibilityPage]) {
      expect(page).toContain(
        "Private, offline, ad-free chess puzzle practice."
      );
    }
  });

  it("leads with an iPhone product view and keeps iPad support secondary", () => {
    expect(homepage).toContain('src="./assets/screenshots/iphone-01.webp"');
    expect(homepage).toContain(
      'alt="Chessticize running a Standard puzzle Sprint on iPhone"'
    );
    expect(homepage).toContain("<strong>Also on iPad.</strong>");
    expect(homepage).toContain("optional private iCloud Sync");
    expect(homepage).not.toContain("Landscape-first on iPad");
    expect(homepage).not.toContain('class="ipad-section');
    expect(homepage).not.toMatch(/src="\.\/assets\/screenshots\/ipad-/);
  });

  it("keeps install, support, privacy, license, and source paths prominent", () => {
    for (const page of [homepage, androidPage, supportPage, accessibilityPage]) {
      expect(page).toContain(appStoreUrl);
      expect(page).toContain(
        "https://github.com/Chessticize/chessticize-mobile"
      );
    }

    expect(homepage).toContain("./android/");
    expect(homepage).toContain("./support/");
    expect(homepage).toContain("./accessibility/");
    expect(homepage).toContain("docs/PRIVACY_POLICY.md");
    expect(homepage).toContain("/LICENSE");
    expect(androidPage).toContain(apkUrl);
    expect(androidPage).toContain(checksum);
    expect(androidPage).toContain("does not update itself");
    expect(supportPage).toContain("support@chessticize.com");
    expect(supportPage).toContain("/issues/new?title=Bug");
    expect(supportPage).toContain("/issues/new?title=Feature");
    expect(accessibilityPage).toContain("/issues/new?title=Accessibility");
    expect(accessibilityPage).toContain("common chess puzzle task");
    expect(accessibilityPageText).toContain("Broad remediation is not currently scheduled");
    expect(accessibilityPageText).toContain("complete grayscale common-task walkthrough is still pending");
    expect(accessibilityPage).toContain("<h2>Current limitations and checks</h2>");
    expect(accessibilityPage).not.toContain("How we prioritize accessibility work");
    expect(accessibilityPage).not.toContain("does not collect usage analytics");

    expect(readme).toContain(appStoreUrl);
    expect(readme).toContain(websiteUrl);
    expect(readme).toContain(androidUrl);
    expect(readme).toContain(supportUrl);
    expect(readme).toContain(accessibilityUrl);
    expect(readme).toContain("site/assets/screenshots/contact-sheet.webp");
  });

  it("is static, local-asset-only, and free of analytics", () => {
    const publicFiles = [
      homepage,
      androidPage,
      supportPage,
      accessibilityPage,
      notFoundPage,
      styles
    ].join("\n");

    expect(publicFiles).not.toMatch(/<script\b/i);
    expect(publicFiles).not.toMatch(
      /google-analytics|googletagmanager|segment\.com|mixpanel|plausible|fathom/i
    );
    expect(publicFiles).not.toMatch(/<img[^>]+src=["']https?:\/\//i);
    expect(publicFiles).not.toMatch(
      /<link[^>]+rel=["'](?:stylesheet|icon)["'][^>]+href=["']https?:\/\//i
    );
    expect(styles).not.toMatch(/@import|url\(\s*["']?https?:\/\//i);
    expect(notFoundPage).toContain('href="/chessticize-mobile/styles.css"');
    expect(notFoundPage).toContain('href="/chessticize-mobile/"');
    expect(landingPageDoc).toMatch(
      /no analytics, database, CDN, remote fonts, or\s+runtime JavaScript/
    );
  });

  it("ships optimized, reproducible marketing images", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.generator).toBe(
      "scripts/prepare-landing-page-assets.mjs"
    );
    expect(manifest.assets).toHaveLength(11);
    expect(assetGenerator).toContain("--source-root");
    expect(assetGenerator).toContain("withoutEnlargement: true");
    expect(landingPageDoc).toContain("pnpm landing-page:assets");

    const totalBytes = manifest.assets.reduce((sum, asset) => {
      const buffer = readBuffer(asset.output);
      const digest = crypto.createHash("sha256").update(buffer).digest("hex");

      expect(digest).toBe(asset.outputSha256);
      expect(buffer.byteLength).toBe(asset.bytes);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);

      if (asset.output.endsWith(".webp")) {
        expect(buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
        expect(buffer.byteLength).toBeLessThan(900_000);
      } else {
        expect(buffer.subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );
      }

      return sum + buffer.byteLength;
    }, 0);

    expect(totalBytes).toBeLessThan(5_000_000);
  });

  it("keeps the marketing images responsive at their intrinsic proportions", () => {
    const globalImageRule = styles.match(/(?:^|\n)img\s*\{([^}]*)\}/)?.[1];
    expect(globalImageRule).toContain("max-width: 100%");
    expect(globalImageRule).toContain("height: auto");

    const marketingImageTags = [...homepage.matchAll(/<img\b[\s\S]*?>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes('src="./assets/screenshots/'));
    expect(marketingImageTags).toHaveLength(6);
    expect(
      marketingImageTags.map(
        (tag) => tag.match(/src="\.\/assets\/screenshots\/([^"]+)"/)?.[1]
      )
    ).toEqual([
      "iphone-01.webp",
      "iphone-02.webp",
      "iphone-03.webp",
      "iphone-04.webp",
      "iphone-05.webp",
      "iphone-06.webp"
    ]);

    for (const tag of marketingImageTags) {
      const output = `site/${tag.match(/src="\.\/([^"]+)"/)?.[1]}`;
      const asset = manifest.assets.find(
        (candidate) => candidate.output === output
      );
      expect(asset).toBeDefined();
      expect(tag).toContain(`width="${asset.width}"`);
      expect(tag).toContain(`height="${asset.height}"`);
    }
  });

  it("keeps the mobile hero readable without the former ultra-tight display type", () => {
    expect(styles).toContain("font-weight: 800");
    expect(styles).toContain("font-weight: 760");
    expect(styles).toContain("font-size: clamp(2.75rem, 12vw, 3.25rem)");
    expect(styles).toContain("letter-spacing: -0.02em");
    expect(styles).toContain("line-height: 1.06");
    expect(styles).toContain("font-size: 0.65rem");
    expect(styles).toContain("letter-spacing: 0.055em");
  });

  it("deploys only the static site with GitHub Pages permissions", () => {
    expect(pagesWorkflow).toContain("actions/checkout@v6");
    expect(pagesWorkflow).toContain("actions/configure-pages@v5");
    expect(pagesWorkflow).toContain("actions/upload-pages-artifact@v4");
    expect(pagesWorkflow).toContain("actions/deploy-pages@v4");
    expect(pagesWorkflow).toContain("path: site");
    expect(pagesWorkflow).toContain("pages: write");
    expect(pagesWorkflow).toContain("id-token: write");
    expect(pagesWorkflow).toContain("name: github-pages");
  });
});
