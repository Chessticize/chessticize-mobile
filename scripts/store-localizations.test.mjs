import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
const readText = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
const charCount = (value) => Array.from(value).length;
const utf8Bytes = (value) => Buffer.byteLength(value, "utf8");

const EXPECTED_APP_LOCALES = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "es",
  "de",
  "fr",
  "pt-BR"
];

test("App Store localized metadata covers all 9 locales within Apple character and UTF-8 byte limits", () => {
  const data = readJson("config/app-store-metadata-localizations-v1.json");
  const entries = Object.entries(data.locales);
  assert.equal(entries.length, 9);

  const appLocales = entries.map(([, entry]) => entry.appLocale).sort();
  assert.deepEqual(appLocales, [...EXPECTED_APP_LOCALES].sort());

  for (const [storeLocale, entry] of entries) {
    assert.ok(charCount(entry.appName) > 0 && charCount(entry.appName) <= data.limits.appNameCharacters, `${storeLocale} appName exceeds ${data.limits.appNameCharacters} chars (${charCount(entry.appName)})`);
    assert.ok(charCount(entry.subtitle) > 0 && charCount(entry.subtitle) <= data.limits.subtitleCharacters, `${storeLocale} subtitle exceeds ${data.limits.subtitleCharacters} chars (${charCount(entry.subtitle)})`);
    assert.ok(charCount(entry.promotionalText) > 0 && charCount(entry.promotionalText) <= data.limits.promotionalTextCharacters, `${storeLocale} promotionalText exceeds ${data.limits.promotionalTextCharacters} chars (${charCount(entry.promotionalText)})`);
    assert.ok(utf8Bytes(entry.keywords) > 0 && utf8Bytes(entry.keywords) <= data.limits.keywordsBytes, `${storeLocale} keywords exceed ${data.limits.keywordsBytes} UTF-8 bytes (${utf8Bytes(entry.keywords)})`);
    assert.ok(charCount(entry.description) > 0 && charCount(entry.description) <= data.limits.descriptionCharacters, `${storeLocale} description exceeds ${data.limits.descriptionCharacters} chars`);
    assert.ok(charCount(entry.currentVersionWhatsNew) > 0 && charCount(entry.currentVersionWhatsNew) <= data.limits.chessticizeWhatsNewCharacters, `${storeLocale} whatsNew exceeds ${data.limits.chessticizeWhatsNewCharacters} chars (${charCount(entry.currentVersionWhatsNew)})`);
    assert.ok(!/https?:\/\//u.test(entry.currentVersionWhatsNew), `${storeLocale} whatsNew must not contain raw URLs`);
  }
});

test("Google Play localized metadata covers all 9 locales within limits and respects Android prohibited claims", () => {
  const data = readJson("config/google-play-metadata-localizations-v1.json");
  const entries = Object.entries(data.locales);
  assert.equal(entries.length, 9);

  const appLocales = entries.map(([, entry]) => entry.appLocale).sort();
  assert.deepEqual(appLocales, [...EXPECTED_APP_LOCALES].sort());

  for (const [storeLocale, entry] of entries) {
    assert.ok(charCount(entry.appName) > 0 && charCount(entry.appName) <= data.limits.appNameCharacters, `${storeLocale} appName exceeds limit (${charCount(entry.appName)})`);
    assert.ok(charCount(entry.shortDescription) > 0 && charCount(entry.shortDescription) <= data.limits.shortDescriptionCharacters, `${storeLocale} shortDescription exceeds limit (${charCount(entry.shortDescription)})`);
    assert.ok(charCount(entry.fullDescription) > 0 && charCount(entry.fullDescription) <= data.limits.fullDescriptionCharacters, `${storeLocale} fullDescription exceeds limit`);
    assert.ok(charCount(entry.appIconAltText) > 0 && charCount(entry.appIconAltText) <= data.limits.graphicAltTextCharacters, `${storeLocale} appIconAltText exceeds limit (${charCount(entry.appIconAltText)})`);
    assert.ok(charCount(entry.featureGraphicAltText) > 0 && charCount(entry.featureGraphicAltText) <= data.limits.graphicAltTextCharacters, `${storeLocale} featureGraphicAltText exceeds limit (${charCount(entry.featureGraphicAltText)})`);
    assert.ok(charCount(entry.currentVersionWhatsNew) > 0 && charCount(entry.currentVersionWhatsNew) <= data.limits.chessticizeWhatsNewCharacters, `${storeLocale} whatsNew exceeds ${data.limits.chessticizeWhatsNewCharacters} chars (${charCount(entry.currentVersionWhatsNew)})`);
    assert.ok(!/https?:\/\//u.test(entry.currentVersionWhatsNew), `${storeLocale} whatsNew must not contain raw URLs`);
    assert.ok(!("keywords" in entry), `${storeLocale} must not include Apple keywords field`);
    assert.ok(!/https?:\/\//u.test(entry.fullDescription), `${storeLocale} fullDescription must not include URLs`);

    const combined = `${entry.appName}\n${entry.shortDescription}\n${entry.fullDescription}\n${entry.currentVersionWhatsNew}`.toLowerCase();
    for (const prohibited of data.prohibitedClaims) {
      assert.ok(
        !combined.includes(prohibited.toLowerCase()),
        `${storeLocale} Google Play copy must not mention prohibited claim "${prohibited}"`
      );
    }
  }
});

test("localized marketing screenshot copy covers all 9 locales and aligns with campaign frame contracts", () => {
  const localized = readJson("config/marketing-screenshots-localizations-v1.json");
  const story = readJson("config/app-store-marketing-story-v1.json");
  const play16 = readJson("config/google-play-metadata-en-us-mobile-1.6-v2.json");

  const mobile16 = localized.campaigns["mobile-1.6"];
  assert.deepEqual(
    mobile16.frameOrder,
    story.releaseCampaign.frames.map((frame) => frame.id)
  );
  assert.deepEqual(
    mobile16.frameOrder,
    play16.previewAssets.screenshots.frames.map((frame) => frame.id)
  );

  for (const locale of EXPECTED_APP_LOCALES) {
    const loc16 = mobile16.locales[locale];
    assert.ok(loc16, `mobile-1.6 missing locale ${locale}`);
    for (const frameId of mobile16.frameOrder) {
      const frame = loc16.frames[frameId];
      assert.ok(frame, `mobile-1.6[${locale}] missing frame ${frameId}`);
      assert.ok(
        charCount(frame.headline) > 0 && charCount(frame.headline) <= localized.limits.headlineCharacters,
        `mobile-1.6[${locale}].${frameId} headline too long (${charCount(frame.headline)})`
      );
      assert.ok(
        charCount(frame.altText) > 0 && charCount(frame.altText) <= localized.limits.altTextCharacters,
        `mobile-1.6[${locale}].${frameId} altText too long (${charCount(frame.altText)})`
      );
    }

    const locV1 = localized.campaigns["v1-core"].locales[locale];
    assert.ok(locV1, `v1-core missing locale ${locale}`);
    for (const frameId of localized.campaigns["v1-core"].frameOrder) {
      const frame = locV1.frames[frameId];
      assert.ok(frame, `v1-core[${locale}] missing frame ${frameId}`);
      assert.ok(
        charCount(frame.headline) > 0 && charCount(frame.headline) <= localized.limits.headlineCharacters,
        `v1-core[${locale}].${frameId} headline too long (${charCount(frame.headline)})`
      );
      assert.ok(
        charCount(frame.supporting) > 0 && charCount(frame.supporting) <= localized.limits.supportingCharacters,
        `v1-core[${locale}].${frameId} supporting too long (${charCount(frame.supporting)})`
      );
    }
  }
});

test("localized static website ships all 9 locales with zero JavaScript and valid hreflang/switcher links", () => {
  const siteConfig = readJson("config/site-localizations-v1.json");
  assert.deepEqual(Object.keys(siteConfig.locales).sort(), [...EXPECTED_APP_LOCALES].sort());

  const nonEnglish = EXPECTED_APP_LOCALES.filter((loc) => loc !== "en");
  for (const locale of nonEnglish) {
    const pages = [
      `site/${locale}/index.html`,
      `site/${locale}/support/index.html`,
      `site/${locale}/accessibility/index.html`,
      `site/${locale}/android/index.template.html`
    ];
    for (const pagePath of pages) {
      assert.equal(existsSync(path.join(REPO_ROOT, pagePath)), true, `Missing localized page ${pagePath}`);
      const html = readText(pagePath);
      assert.ok(html.includes(`<html lang="${locale}">`), `${pagePath} missing lang="${locale}"`);
      assert.ok(!/<script\b/i.test(html), `${pagePath} must not contain any <script> tags`);
      assert.ok(!/google-analytics|googletagmanager|segment\.com|mixpanel|plausible|fathom/i.test(html));
      assert.ok(html.includes('class="section-shell locale-switcher"'), `${pagePath} missing locale switcher`);
      assert.ok(html.includes('hreflang="x-default"'), `${pagePath} missing x-default hreflang`);
      for (const loc of EXPECTED_APP_LOCALES) {
        assert.ok(html.includes(`hreflang="${loc}"`), `${pagePath} missing hreflang="${loc}"`);
      }
      if (pagePath.endsWith("android/index.template.html")) {
        assert.ok(html.includes("{{ANDROID_APK_URL}}"), `${pagePath} missing {{ANDROID_APK_URL}} token`);
        assert.ok(html.includes("{{ANDROID_APK_SHA256}}"), `${pagePath} missing {{ANDROID_APK_SHA256}} token`);
      }
    }
  }

  for (const enPage of [
    "site/index.html",
    "site/support/index.html",
    "site/accessibility/index.html",
    "site/android/index.template.html"
  ]) {
    const html = readText(enPage);
    assert.ok(!/<script\b/i.test(html), `${enPage} must not contain any <script> tags`);
    assert.ok(html.includes('class="section-shell locale-switcher"'), `${enPage} missing locale switcher`);
    assert.ok(html.includes('hreflang="ja"'), `${enPage} missing hreflang="ja"`);
  }
});
