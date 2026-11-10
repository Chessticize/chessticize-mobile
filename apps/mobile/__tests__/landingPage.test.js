const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = relativePath =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readBuffer = relativePath =>
  fs.readFileSync(path.join(repoRoot, relativePath));
const homepage = read('site/index.html');
const androidPage = read('site/android/index.template.html');
const supportPage = read('site/support/index.html');
const accessibilityPage = read('site/accessibility/index.html');
const accessibilityPageText = accessibilityPage.replace(/\s+/gu, ' ');
const notFoundPage = read('site/404.html');
const styles = read('site/styles.css');
const readme = read('README.md');
const landingPageDoc = read('docs/LANDING_PAGE.md');
const pagesWorkflow = read('.github/workflows/pages.yml');
const assetGenerator = read('scripts/prepare-landing-page-assets.mjs');
const manifest = JSON.parse(read('site/assets/marketing-assets.json'));
const appStoreBadge = readBuffer('site/assets/download-on-the-app-store.svg');
const googlePlayBadge = readBuffer('site/assets/get-it-on-google-play.png');

const appStoreUrl = 'https://apps.apple.com/us/app/chessticize/id6788610123';
const googlePlayUrl =
  'https://play.google.com/store/apps/details?id=com.chessticize.mobile';
const screenshotOutputs = [
  'phone-practice-home.webp',
  'phone-dark-arrow-duel.webp',
  'phone-review.webp',
  'phone-tactical-profile.webp',
  'phone-focused-run.webp',
  'ipad-dark-arrow-duel.webp',
  'duo-dark-arrow-duel.webp',
];

describe('public landing page', () => {
  it('describes the shipped practice loop without overstating the early estimate', () => {
    expect(homepage).toContain('Chess puzzles for focused practice.');
    expect(homepage).toContain('rating-matched puzzle Sprints');
    expect(homepage).toMatch(/Compare moves in Arrow\s+Duel/);
    expect(homepage).toContain('scheduled Review');
    expect(homepage).toContain('Free. Offline. No ads or account.');
    expect(homepage).toContain('Tactical Profile');
    expect(homepage).toContain('early estimate');
    expect(homepage).toContain(
      'choose the themes, pace, and difficulty yourself',
    );
    expect(homepage).not.toMatch(/adaptive practice/i);
    expect(homepage).not.toMatch(/confident weakness|guaranteed weakness/i);
  });

  it('keeps the migration notice complete but out of the opening hierarchy', () => {
    expect(homepage).toMatch(
      /<details class="notice section-shell">[\s\S]*?<summary>The web app has moved<\/summary>/,
    );
    expect(homepage).toContain(
      "Hi everyone! I've been using the offline app myself lately",
    );
    expect(homepage).toMatch(
      /Thank you so much for using it, and sorry about the sudden\s+outage!/,
    );
    expect(homepage).toContain('Chessticize is a one-person hobby project');
    expect(homepage).toContain('chessticize-web Discussions');
    expect(
      homepage.match(/href="https:\/\/app\.chessticize\.com"/g),
    ).toHaveLength(5);
  });

  it('keeps install, support, privacy, license, source, and accessibility routes available', () => {
    for (const page of [
      homepage,
      androidPage,
      supportPage,
      accessibilityPage,
    ]) {
      expect(page).toContain(appStoreUrl);
      expect(page).toContain(
        'https://github.com/Chessticize/chessticize-mobile',
      );
      for (const [, anchor] of page.matchAll(/href="\.\.\/#([^"]+)"/g)) {
        expect(homepage).toContain(`id="${anchor}"`);
      }
    }
    expect(homepage).toContain(googlePlayUrl);
    expect(homepage).toContain(
      'aria-label="Download Chessticize on the App Store"',
    );
    expect(homepage).toContain('aria-label="Get Chessticize on Google Play"');
    expect(homepage).toContain('./android/');
    expect(homepage).toContain('./support/');
    expect(homepage).toContain('./accessibility/');
    expect(homepage).toContain('docs/PRIVACY_POLICY.md');
    expect(homepage).toContain('/LICENSE');
    expect(homepage).toContain(
      'href="https://github.com/Chessticize/chessticize-web/discussions"',
    );
    expect(androidPage).toContain('{{ANDROID_APK_URL}}');
    expect(androidPage).toContain(
      'Google Play is the recommended install path',
    );
    expect(supportPage).toContain('support@chessticize.com');
    expect(accessibilityPage).toContain('common chess puzzle task');
    expect(accessibilityPageText).toContain(
      'Broad remediation is not currently scheduled',
    );
    expect(readme).toContain('site/assets/screenshots/contact-sheet.webp');
  });

  it('is a local static site with a responsive dark appearance', () => {
    const publicFiles = [
      homepage,
      androidPage,
      supportPage,
      accessibilityPage,
      notFoundPage,
      styles,
    ].join('\n');
    expect(publicFiles).not.toMatch(/<script\b/i);
    expect(publicFiles).not.toMatch(
      /google-analytics|googletagmanager|segment\.com|mixpanel|plausible|fathom/i,
    );
    expect(publicFiles).not.toMatch(/<img[^>]+src=["']https?:\/\//i);
    expect(publicFiles).not.toMatch(
      /<link[^>]+rel=["'](?:stylesheet|icon)["'][^>]+href=["']https?:\/\//i,
    );
    expect(styles).not.toMatch(/@import|url\(\s*["']?https?:\/\//i);
    expect(styles).toContain('@media (prefers-color-scheme: dark)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('max-width: 100%');
    expect(styles).toContain('height: auto');
    expect(notFoundPage).toContain('href="/styles.css"');
    expect(landingPageDoc).toMatch(
      /no analytics, database, CDN, remote fonts, or\s+runtime JavaScript/,
    );
  });

  it('ships approved 1.6 screenshot derivatives with verifiable provenance', () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sourceCollection).toBe('mobile-1.6-current');
    expect(manifest.generator).toBe('scripts/prepare-landing-page-assets.mjs');
    expect(manifest.sources).toEqual(
      expect.arrayContaining([
        {
          collection: 'mobile-1.6/app-store-raw-b2ba-normal-final',
          appSourceCommit: 'b2ba55b8d8e1b443c82490b9e1508d733ecc9207',
        },
        {
          collection: 'mobile-1.6/duo-inner-b2ba-final',
          appSourceCommit: 'b2ba55b8d8e1b443c82490b9e1508d733ecc9207',
          captureRunnerCommit: '2c0ce5e82c6ed67c608cfd5543120d7ab6d222d6',
        },
      ]),
    );
    expect(manifest.assets).toHaveLength(15);
    expect(assetGenerator).toContain('--source-root');
    expect(assetGenerator).toContain('--duo-source-root');
    expect(assetGenerator).toContain('withoutEnlargement: true');
    expect(assetGenerator).toContain('Capture manifest hash mismatch');
    expect(landingPageDoc).toContain('pnpm landing-page:assets');

    const totalBytes = manifest.assets.reduce((sum, asset) => {
      const buffer = readBuffer(asset.output);
      expect(crypto.createHash('sha256').update(buffer).digest('hex')).toBe(
        asset.outputSha256,
      );
      expect(buffer.byteLength).toBe(asset.bytes);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(asset.source).not.toMatch(/^\//);
      expect(asset.source).not.toMatch(/Users\/|scratch\//);
      if (asset.source.startsWith('mobile-1.6/')) {
        expect(asset.sourceCommit).toBe(
          'b2ba55b8d8e1b443c82490b9e1508d733ecc9207',
        );
      }
      if (asset.output.endsWith('.webp')) {
        expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
        expect(buffer.byteLength).toBeLessThan(900_000);
      }
      return sum + buffer.byteLength;
    }, 0);
    expect(totalBytes).toBeLessThan(5_000_000);
  });

  it('uses complete intrinsic native screenshots without old poster paths', () => {
    const marketingTags = [...homepage.matchAll(/<img\b[\s\S]*?>/g)]
      .map(([tag]) => tag)
      .filter(tag => tag.includes('src="./assets/screenshots/'));
    expect(marketingTags).toHaveLength(screenshotOutputs.length);
    expect(
      marketingTags.map(tag => tag.match(/screenshots\/([^"]+)/)?.[1]),
    ).toEqual(screenshotOutputs);
    expect(homepage).not.toMatch(/iphone-0[1-6]\.webp|ipad-0[1-6]\.webp/);
    for (const tag of marketingTags) {
      const output = `site/assets/screenshots/${
        tag.match(/screenshots\/([^"]+)/)?.[1]
      }`;
      const asset = manifest.assets.find(
        candidate => candidate.output === output,
      );
      expect(asset).toBeDefined();
      expect(tag).toContain(`width="${asset.width}"`);
      expect(tag).toContain(`height="${asset.height}"`);
    }
  });

  it('ships unmodified official store badges as local assets', () => {
    expect(
      crypto.createHash('sha256').update(appStoreBadge).digest('hex'),
    ).toBe('a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f');
    expect(
      crypto.createHash('sha256').update(googlePlayBadge).digest('hex'),
    ).toBe('f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849');
    expect(appStoreBadge.toString('utf8')).toContain('height="40"');
    expect(landingPageDoc).toContain(
      'unmodified, locally served vendor artwork',
    );
  });

  it('deploys only the static site with GitHub Pages permissions', () => {
    for (const action of [
      'actions/checkout@v6',
      'actions/configure-pages@v5',
      'actions/upload-pages-artifact@v4',
      'actions/deploy-pages@v4',
    ]) {
      expect(pagesWorkflow).toContain(action);
    }
    expect(pagesWorkflow).toContain('workflow_run:');
    expect(pagesWorkflow).toContain('Publish Play-generated Android APK');
    expect(pagesWorkflow).toContain('render-android-download-page.mjs');
    expect(pagesWorkflow).toContain('pages: write');
    expect(pagesWorkflow).toContain('id-token: write');
  });
});
