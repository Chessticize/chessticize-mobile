#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "site-localizations-v1.json");
const SITE_DIR = path.join(REPO_ROOT, "site");

const APP_STORE_URL = "https://apps.apple.com/us/app/chessticize/id6788610123";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.chessticize.mobile";
const WEB_APP_URL = "https://app.chessticize.com";
const GITHUB_URL = "https://github.com/Chessticize/chessticize-mobile";
const PRIVACY_URL = `${GITHUB_URL}/blob/main/docs/PRIVACY_POLICY.md`;
const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
const DISCUSSIONS_URL = `${GITHUB_URL}/discussions`;
const WEB_DISCUSSIONS_URL = "https://github.com/Chessticize/chessticize-web/discussions";

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageRelativeHref(fromLocale, toLocale, pageSlug) {
  const fromDepth = (fromLocale === "en" ? 0 : 1) + (pageSlug ? 1 : 0);
  const up = fromDepth === 0 ? "./" : "../".repeat(fromDepth);
  const targetParts = [];
  if (toLocale !== "en") targetParts.push(toLocale);
  if (pageSlug) targetParts.push(pageSlug);
  return targetParts.length === 0 ? up : `${up}${targetParts.join("/")}/`;
}

function pageCanonicalUrl(origin, locale, pageSlug) {
  const parts = [];
  if (locale !== "en") parts.push(locale);
  if (pageSlug) parts.push(pageSlug);
  return parts.length === 0 ? `${origin}/` : `${origin}/${parts.join("/")}/`;
}

function buildHreflangLinks(origin, localeKeys, pageSlug) {
  const lines = localeKeys.map(
    (loc) =>
      `    <link rel="alternate" hreflang="${esc(loc)}" href="${esc(pageCanonicalUrl(origin, loc, pageSlug))}" />`
  );
  lines.push(
    `    <link rel="alternate" hreflang="x-default" href="${esc(pageCanonicalUrl(origin, "en", pageSlug))}" />`
  );
  return lines.join("\n");
}

function buildLanguageSwitcher(config, currentLocale, pageSlug) {
  const localeKeys = Object.keys(config.locales);
  const navLabel = config.locales[currentLocale].languageNavLabel;
  const links = localeKeys
    .map((loc) => {
      const label = esc(config.locales[loc].nativeLabel);
      const href = esc(pageRelativeHref(currentLocale, loc, pageSlug));
      if (loc === currentLocale) {
        return `<a href="${href}" lang="${esc(loc)}" aria-current="page">${label}</a>`;
      }
      return `<a href="${href}" lang="${esc(loc)}">${label}</a>`;
    })
    .join("");
  return `      <nav class="section-shell locale-switcher" aria-label="${esc(navLabel)}">${links}</nav>`;
}

function renderLocalizedIndex(config, locale) {
  const loc = config.locales[locale];
  const p = loc.index;
  const n = loc.nav;
  const localeKeys = Object.keys(config.locales);
  const canonical = pageCanonicalUrl(config.siteOrigin, locale, "");
  const hreflangs = buildHreflangLinks(config.siteOrigin, localeKeys, "");
  const switcher = buildLanguageSwitcher(config, locale, "");

  return `<!DOCTYPE html>
<html lang="${esc(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${esc(p.description)}" />
    <meta name="theme-color" content="#f7fbff" />
    <link rel="canonical" href="${esc(canonical)}" />
${hreflangs}
    <link rel="icon" href="../assets/app-icon-192.png" sizes="192x192" />
    <link rel="stylesheet" href="../styles.css" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(p.ogTitle)}" />
    <meta property="og:description" content="${esc(p.ogDescription)}" />
    <meta property="og:image" content="${config.siteOrigin}/assets/screenshots/phone-practice-home.webp" />
    <title>${esc(p.title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(loc.skipToContent)}</a>
    <header class="site-header">
      <a class="brand" href="./" aria-label="${esc(loc.homeAria)}"
        ><img src="../assets/app-icon-192.png" width="42" height="42" alt="" /><span>Chessticize</span></a
      >
      <nav aria-label="${esc(loc.primaryNavAria)}">
        <a href="#review">${esc(n.review)}</a><a href="#practice">${esc(n.focusedPractice)}</a
        ><a href="#privacy">${esc(n.privacy)}</a><a href="./support/">${esc(n.support)}</a
        ><a href="${WEB_APP_URL}">${esc(n.playOnline)}</a
        ><a class="nav-source" href="${GITHUB_URL}">${esc(n.source)}</a>
      </nav>
    </header>
    <aside class="online-notice section-shell" aria-label="${esc(p.onlineNoticeAria)}">
      <p>
        ${esc(p.onlineNoticeText)}
        <a href="${WEB_APP_URL}">app.<wbr />chessticize.com</a>.
      </p>
      <a class="button button-primary" href="${WEB_APP_URL}">${esc(p.onlineNoticeButton)}</a>
      <details class="notice">
        <summary>${esc(p.onlineNoticeSummary)}</summary>
        <div class="notice-body">
          <p>${esc(p.onlineNoticeP1)} <strong>${esc(p.onlineNoticeP1Strong)}</strong></p>
          <p>
            ${esc(p.onlineNoticeP2Before)}<a href="${WEB_APP_URL}">app.chessticize.com</a>${esc(p.onlineNoticeP2Mid)}<a href="${WEB_DISCUSSIONS_URL}">${esc(p.onlineNoticeP2Link)}</a>${esc(p.onlineNoticeP2After)}
          </p>
          <p>${esc(p.onlineNoticeP3)}</p>
        </div>
      </details>
    </aside>
    <main id="main">
      <section id="puzzle-story" class="hero section-shell" aria-labelledby="hero-title">
        <div class="hero-copy">
          <h1 id="hero-title">${esc(p.heroTitle)}</h1>
          <p class="hero-lede">${esc(p.heroLede)}</p>
          <p class="hero-fact">${esc(p.heroFact)}</p>
          <div class="install-actions" aria-label="${esc(p.installAria)}">
            <a class="store-badge-link" href="${APP_STORE_URL}" aria-label="${esc(p.appStoreAria)}"
              ><img class="store-badge store-badge-apple" src="../assets/download-on-the-app-store.svg" width="120" height="40" alt=""
            /></a>
            <a class="store-badge-link" href="${GOOGLE_PLAY_URL}" aria-label="${esc(p.googlePlayAria)}"
              ><img class="store-badge store-badge-google" src="../assets/get-it-on-google-play.png" width="155" height="60" alt=""
            /></a>
            <a class="button button-light button-store-peer" href="${WEB_APP_URL}"
              ><strong>${esc(n.playOnline)}</strong></a
            >
          </div>
        </div>
        <div class="hero-phones" aria-label="${esc(p.heroPhonesAria)}">
          <figure class="phone-frame">
            <img src="../assets/screenshots/phone-practice-home.webp" width="660" height="1434" alt="${esc(p.altPracticeHome)}" fetchpriority="high" />
          </figure>
          <figure class="phone-frame">
            <img src="../assets/screenshots/phone-dark-arrow-duel.webp" width="660" height="1434" alt="${esc(p.altDarkArrowDuel)}" fetchpriority="high" />
          </figure>
        </div>
      </section>
      <section id="review" class="review-section section-shell" aria-labelledby="review-title">
        <div class="section-copy">
          <h2 id="review-title">${esc(p.reviewTitle)}</h2>
          <p>${esc(p.reviewBody)}</p>
        </div>
        <figure class="phone-frame review-phone">
          <img src="../assets/screenshots/phone-review.webp" width="660" height="1434" alt="${esc(p.altReview)}" loading="lazy" />
        </figure>
      </section>
      <section id="practice" class="practice-section" aria-labelledby="practice-title">
        <div class="section-shell practice-layout">
          <div class="section-copy practice-copy">
            <h2 id="practice-title">${esc(p.practiceTitle)}</h2>
            <p>${esc(p.practiceBody)}</p>
          </div>
          <div class="practice-phones" aria-label="${esc(p.practicePhonesAria)}">
            <figure class="phone-frame">
              <img src="../assets/screenshots/phone-tactical-profile.webp" width="660" height="1434" alt="${esc(p.altTacticalProfile)}" loading="lazy" />
            </figure>
            <figure class="phone-frame focused-run-phone">
              <img src="../assets/screenshots/phone-focused-run.webp" width="660" height="1434" alt="${esc(p.altFocusedRun)}" loading="lazy" />
            </figure>
          </div>
        </div>
      </section>
      <section id="privacy" class="private-section" aria-labelledby="private-title">
        <div class="section-shell private-layout">
          <div class="section-copy private-copy">
            <h2 id="private-title">${esc(p.privateTitle)}</h2>
            <p>${esc(p.privateBody)}</p>
            <div class="inline-links">
              <a href="${PRIVACY_URL}">${esc(p.privacyLink)}</a><a href="${LICENSE_URL}">${esc(p.licenseLink)}</a>
            </div>
          </div>
          <div class="wide-screens" aria-label="${esc(p.wideScreensAria)}">
            <figure class="wide-frame ipad-frame">
              <img src="../assets/screenshots/ipad-dark-arrow-duel.webp" width="1440" height="1080" alt="${esc(p.altIpad)}" loading="lazy" />
            </figure>
            <figure class="wide-frame duo-frame">
              <img src="../assets/screenshots/duo-dark-arrow-duel.webp" width="1440" height="1013" alt="${esc(p.altDuo)}" loading="lazy" />
            </figure>
          </div>
        </div>
      </section>
      <section class="close-section section-shell" aria-labelledby="close-title">
        <div><h2 id="close-title">${esc(p.closeTitle)}</h2></div>
        <div class="close-actions">
          <a class="button button-primary" href="./support/"><strong>${esc(p.closeSupport)}</strong></a
          ><a class="button button-light" href="${GITHUB_URL}"><strong>${esc(p.closeSource)}</strong></a>
        </div>
      </section>
    </main>
    <footer>
      <div class="section-shell footer-grid">
        <div>
          <a class="brand footer-brand" href="./"
            ><img src="../assets/app-icon-192.png" width="36" height="36" alt="" /><span>Chessticize</span></a
          >
          <p>${esc(loc.footerTagline)}</p>
        </div>
        <nav aria-label="${esc(loc.footerNavAria)}">
          <a href="${APP_STORE_URL}">App Store</a><a href="${GOOGLE_PLAY_URL}">Google Play</a
          ><a href="./android/">${esc(n.androidApk)}</a><a href="${WEB_APP_URL}">${esc(n.playOnline)}</a
          ><a href="./support/">${esc(n.support)}</a><a href="${DISCUSSIONS_URL}">${esc(n.discussions)}</a
          ><a href="./accessibility/">${esc(n.accessibility)}</a><a href="${GITHUB_URL}">${esc(n.source)}</a
          ><a href="${PRIVACY_URL}">${esc(n.privacy)}</a>
        </nav>
      </div>
${switcher}
    </footer>
  </body>
</html>
`;
}

function renderLocalizedSupport(config, locale) {
  const loc = config.locales[locale];
  const p = loc.support;
  const n = loc.nav;
  const localeKeys = Object.keys(config.locales);
  const canonical = pageCanonicalUrl(config.siteOrigin, locale, "support");
  const hreflangs = buildHreflangLinks(config.siteOrigin, localeKeys, "support");
  const switcher = buildLanguageSwitcher(config, locale, "support");

  return `<!doctype html>
<html lang="${esc(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${esc(p.description)}" />
    <meta name="theme-color" content="#f7fbff" />
    <link rel="canonical" href="${esc(canonical)}" />
${hreflangs}
    <link rel="icon" href="../../assets/app-icon-192.png" sizes="192x192" />
    <link rel="stylesheet" href="../../styles.css" />
    <title>${esc(p.title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(loc.skipToContent)}</a>
    <header class="site-header">
      <a class="brand" href="../" aria-label="${esc(loc.homeAria)}">
        <img src="../../assets/app-icon-192.png" width="42" height="42" alt="" />
        <span>Chessticize</span>
      </a>
      <nav aria-label="${esc(loc.primaryNavAria)}">
        <a href="../#puzzle-story">${esc(n.howItWorks)}</a>
        <a href="../#privacy">${esc(n.privacy)}</a>
        <a href="../android/">${esc(n.android)}</a>
        <a class="nav-source" href="${GITHUB_URL}">${esc(n.source)}</a>
      </nav>
    </header>
    <main id="main" class="simple-page section-shell">
      <div class="simple-page-header">
        <p class="eyebrow">${esc(p.eyebrow)}</p>
        <h1>${esc(p.h1)}</h1>
        <p>
          ${esc(p.introBefore)}<a href="${DISCUSSIONS_URL}">${esc(p.introLink)}</a>${esc(p.introAfter)}
        </p>
      </div>
      <div class="info-grid">
        <section class="info-card">
          <h2>${esc(p.bugTitle)}</h2>
          <p>${esc(p.bugBody)}</p>
          <a class="button button-primary" href="${GITHUB_URL}/issues/new?title=Bug%3A%20">
            <strong>${esc(p.bugCta)}</strong>
          </a>
        </section>
        <section class="info-card">
          <h2>${esc(p.ideaTitle)}</h2>
          <p>${esc(p.ideaBody)}</p>
          <a class="button button-secondary" href="${DISCUSSIONS_URL}/new?category=ideas">
            <strong>${esc(p.ideaCta)}</strong>
          </a>
        </section>
        <section class="info-card">
          <h2>${esc(p.privateTitle)}</h2>
          <p>
            ${esc(p.privateBefore)}<a href="mailto:support@chessticize.com">support@chessticize.com</a>${esc(p.privateAfter)}
          </p>
        </section>
        <section class="info-card">
          <h2>${esc(p.policiesTitle)}</h2>
          <p>
            <a href="${PRIVACY_URL}">${esc(p.privacy)}</a>
            ·
            <a href="${LICENSE_URL}">${esc(p.license)}</a>
            ·
            <a href="${GITHUB_URL}">${esc(p.source)}</a>
          </p>
        </section>
      </div>
    </main>
    <footer>
      <div class="section-shell footer-grid">
        <div>
          <a class="brand footer-brand" href="../">
            <img src="../../assets/app-icon-192.png" width="36" height="36" alt="" />
            <span>Chessticize</span>
          </a>
          <p>${esc(loc.footerTagline)}</p>
        </div>
        <nav aria-label="${esc(loc.footerNavAria)}">
          <a href="${APP_STORE_URL}">App Store</a>
          <a href="../android/">${esc(n.android)}</a>
          <a href="../accessibility/">${esc(n.accessibility)}</a>
          <a href="${GITHUB_URL}">${esc(n.source)}</a>
        </nav>
      </div>
${switcher}
    </footer>
  </body>
</html>
`;
}

function renderLocalizedAccessibility(config, locale) {
  const loc = config.locales[locale];
  const p = loc.accessibility;
  const n = loc.nav;
  const localeKeys = Object.keys(config.locales);
  const canonical = pageCanonicalUrl(config.siteOrigin, locale, "accessibility");
  const hreflangs = buildHreflangLinks(config.siteOrigin, localeKeys, "accessibility");
  const switcher = buildLanguageSwitcher(config, locale, "accessibility");

  return `<!doctype html>
<html lang="${esc(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${esc(p.description)}" />
    <meta name="theme-color" content="#f7fbff" />
    <link rel="canonical" href="${esc(canonical)}" />
${hreflangs}
    <link rel="icon" href="../../assets/app-icon-192.png" sizes="192x192" />
    <link rel="stylesheet" href="../../styles.css" />
    <title>${esc(p.title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(loc.skipToContent)}</a>
    <header class="site-header">
      <a class="brand" href="../" aria-label="${esc(loc.homeAria)}">
        <img src="../../assets/app-icon-192.png" width="42" height="42" alt="" />
        <span>Chessticize</span>
      </a>
      <nav aria-label="${esc(loc.primaryNavAria)}">
        <a href="../#puzzle-story">${esc(n.howItWorks)}</a>
        <a href="../#privacy">${esc(n.privacy)}</a>
        <a href="../support/">${esc(n.support)}</a>
        <a class="nav-source" href="${GITHUB_URL}">${esc(n.source)}</a>
      </nav>
    </header>
    <main id="main" class="simple-page section-shell">
      <div class="simple-page-header">
        <p class="eyebrow">${esc(p.eyebrow)}</p>
        <h1>${esc(p.h1)}</h1>
        <p>${esc(p.intro1)}</p>
        <p>${esc(p.intro2)}</p>
      </div>
      <div class="info-grid">
        <section class="info-card">
          <h2>${esc(p.card1Title)}</h2>
          <p>${esc(p.card1Body)}</p>
        </section>
        <section class="info-card">
          <h2>${esc(p.card2Title)}</h2>
          <p>${esc(p.card2Body)}</p>
        </section>
        <section class="info-card">
          <h2>${esc(p.card3Title)}</h2>
          <p>${esc(p.card3Body)}</p>
        </section>
        <section class="info-card">
          <h2>${esc(p.card4Title)}</h2>
          <p>${esc(p.card4Body)}</p>
        </section>
      </div>
      <section class="simple-page-header simple-page-section">
        <h2>${esc(p.section1Title)}</h2>
        <p>${esc(p.section1Body)}</p>
      </section>
      <section class="simple-page-header simple-page-section">
        <h2>${esc(p.section2Title)}</h2>
        <p>${esc(p.section2Body)}</p>
        <div class="button-row">
          <a class="button button-primary" href="${GITHUB_URL}/issues/new?title=Accessibility%3A%20">
            <strong>${esc(p.ctaBug)}</strong>
          </a>
          <a class="button button-secondary" href="../support/">
            <strong>${esc(p.ctaSupport)}</strong>
          </a>
        </div>
      </section>
    </main>
    <footer>
      <div class="section-shell footer-grid">
        <div>
          <a class="brand footer-brand" href="../">
            <img src="../../assets/app-icon-192.png" width="36" height="36" alt="" />
            <span>Chessticize</span>
          </a>
          <p>${esc(loc.footerTagline)}</p>
        </div>
        <nav aria-label="${esc(loc.footerNavAria)}">
          <a href="${APP_STORE_URL}">App Store</a>
          <a href="../android/">${esc(n.android)}</a>
          <a href="../support/">${esc(n.support)}</a>
          <a href="${GITHUB_URL}">${esc(n.source)}</a>
        </nav>
      </div>
${switcher}
    </footer>
  </body>
</html>
`;
}

function renderLocalizedAndroidTemplate(config, locale) {
  const loc = config.locales[locale];
  const p = loc.android;
  const n = loc.nav;
  const localeKeys = Object.keys(config.locales);
  const canonical = pageCanonicalUrl(config.siteOrigin, locale, "android");
  const hreflangs = buildHreflangLinks(config.siteOrigin, localeKeys, "android");
  const switcher = buildLanguageSwitcher(config, locale, "android");

  return `<!doctype html>
<html lang="${esc(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${esc(p.description)}" />
    <meta name="theme-color" content="#f7fbff" />
    <link rel="canonical" href="${esc(canonical)}" />
${hreflangs}
    <link rel="icon" href="../../assets/app-icon-192.png" sizes="192x192" />
    <link rel="stylesheet" href="../../styles.css" />
    <title>${esc(p.title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(loc.skipToContent)}</a>
    <header class="site-header">
      <a class="brand" href="../" aria-label="${esc(loc.homeAria)}">
        <img src="../../assets/app-icon-192.png" width="42" height="42" alt="" />
        <span>Chessticize</span>
      </a>
      <nav aria-label="${esc(loc.primaryNavAria)}">
        <a href="../#puzzle-story">${esc(n.howItWorks)}</a>
        <a href="../#privacy">${esc(n.privacy)}</a>
        <a href="../support/">${esc(n.support)}</a>
        <a class="nav-source" href="${GITHUB_URL}">${esc(n.source)}</a>
      </nav>
    </header>
    <main id="main" class="simple-page section-shell">
      <div class="simple-page-header">
        <p class="eyebrow">${esc(p.eyebrow)}</p>
        <h1>${esc(p.h1)}</h1>
        <p>${esc(p.intro)}</p>
      </div>
      <div class="info-grid">
        <section class="info-card">
          <h2>${esc(p.playTitle)}</h2>
          <p>${esc(p.playBody)}</p>
          <a class="store-badge-link" href="${GOOGLE_PLAY_URL}" aria-label="${esc(p.playAria)}">
            <img class="store-badge store-badge-google" src="../../assets/get-it-on-google-play.png" width="155" height="60" alt="" />
          </a>
        </section>
        <section class="info-card">
          <h2>${esc(p.apkTitle)}</h2>
          <p>${esc(p.apkMeta)} <code>com.chessticize.mobile</code></p>
          <a class="button button-primary" href="{{ANDROID_APK_URL}}">
            <span class="button-kicker">${esc(p.apkDownloadKicker)}</span>
            <strong>${esc(p.apkDownloadLabel)}</strong>
          </a>
          <p>${esc(p.apkNote1)}</p>
          <p>${esc(p.apkNote2)}</p>
        </section>
        <section class="info-card">
          <h2>${esc(p.verifyTitle)}</h2>
          <p>${esc(p.verifySha)}</p>
          <p class="checksum">{{ANDROID_APK_SHA256}}</p>
          <p>
            ${esc(p.verifyBefore)}<a href="{{ANDROID_CHECKSUM_URL}}">${esc(p.verifyChecksum)}</a>${esc(p.verifyMid)}<a href="{{ANDROID_RELEASE_URL}}">${esc(p.verifyRelease)}</a>${esc(p.verifyAfter)}
          </p>
        </section>
        <section class="info-card">
          <h2>${esc(p.stepsTitle)}</h2>
          <ol class="numbered-steps">
            <li>${esc(p.step1)}</li>
            <li>${esc(p.step2)}</li>
            <li>${esc(p.step3)}</li>
          </ol>
        </section>
        <section class="info-card">
          <h2>${esc(p.updatesTitle)}</h2>
          <p>${esc(p.updatesBody1)}</p>
          <p>${esc(p.updatesBody2)}</p>
        </section>
      </div>
    </main>
    <footer>
      <div class="section-shell footer-grid">
        <div>
          <a class="brand footer-brand" href="../">
            <img src="../../assets/app-icon-192.png" width="36" height="36" alt="" />
            <span>Chessticize</span>
          </a>
          <p>${esc(loc.footerTagline)}</p>
        </div>
        <nav aria-label="${esc(loc.footerNavAria)}">
          <a href="${APP_STORE_URL}">App Store</a>
          <a href="${GOOGLE_PLAY_URL}">Google Play</a>
          <a href="../support/">${esc(n.support)}</a>
          <a href="../accessibility/">${esc(n.accessibility)}</a>
          <a href="${GITHUB_URL}">${esc(n.source)}</a>
        </nav>
      </div>
${switcher}
    </footer>
  </body>
</html>
`;
}

function injectIntoCanonicalEnglishPage(filePath, config, pageSlug) {
  const localeKeys = Object.keys(config.locales);
  const hreflangs = buildHreflangLinks(config.siteOrigin, localeKeys, pageSlug);
  const switcher = buildLanguageSwitcher(config, "en", pageSlug);
  let html = readFileSync(filePath, "utf8");

  // Strip any previous generated hreflang block & locale-switcher block so script is idempotent
  html = html.replace(/\n\s*<!-- hreflang:start -->[\s\S]*?<!-- hreflang:end -->/g, "");
  html = html.replace(/\n\s*<!-- locale-switcher:start -->[\s\S]*?<!-- locale-switcher:end -->/g, "");

  html = html.replace(
    /(<link[\s\S]*?rel="canonical"[\s\S]*?>)/,
    `$1\n    <!-- hreflang:start -->\n${hreflangs}\n    <!-- hreflang:end -->`
  );
  html = html.replace(
    /(\s*<\/footer>)/,
    `\n      <!-- locale-switcher:start -->\n${switcher}\n      <!-- locale-switcher:end -->$1`
  );

  writeFileSync(filePath, html, "utf8");
}

export function buildLocalizedSite() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const localeKeys = Object.keys(config.locales);
  const nonEnglish = localeKeys.filter((loc) => loc !== "en");

  // Inject hreflang + zero-JS language switcher into canonical English pages without altering English copy
  injectIntoCanonicalEnglishPage(path.join(SITE_DIR, "index.html"), config, "");
  injectIntoCanonicalEnglishPage(path.join(SITE_DIR, "support", "index.html"), config, "support");
  injectIntoCanonicalEnglishPage(path.join(SITE_DIR, "accessibility", "index.html"), config, "accessibility");
  injectIntoCanonicalEnglishPage(path.join(SITE_DIR, "android", "index.template.html"), config, "android");

  let generatedCount = 0;
  for (const locale of nonEnglish) {
    const locDir = path.join(SITE_DIR, locale);
    mkdirSync(path.join(locDir, "support"), { recursive: true });
    mkdirSync(path.join(locDir, "accessibility"), { recursive: true });
    mkdirSync(path.join(locDir, "android"), { recursive: true });

    writeFileSync(path.join(locDir, "index.html"), renderLocalizedIndex(config, locale), "utf8");
    writeFileSync(path.join(locDir, "support", "index.html"), renderLocalizedSupport(config, locale), "utf8");
    writeFileSync(
      path.join(locDir, "accessibility", "index.html"),
      renderLocalizedAccessibility(config, locale),
      "utf8"
    );
    writeFileSync(
      path.join(locDir, "android", "index.template.html"),
      renderLocalizedAndroidTemplate(config, locale),
      "utf8"
    );
    generatedCount += 4;
  }

  return { locales: localeKeys, generatedCount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildLocalizedSite();
  console.log(
    `Built localized static site: ${result.generatedCount} localized pages across ${result.locales.length - 1} non-English locales (+ hreflang & language switcher on canonical English pages).`
  );
}
