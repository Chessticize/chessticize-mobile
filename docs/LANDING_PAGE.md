# Landing Page

The public Chessticize website is a zero-cost static GitHub Pages site generated
from [`site/`](../site/). It uses no analytics, database, CDN, remote fonts, or
runtime JavaScript. The deployment workflow publishes that directory after a
change reaches `main`.

Public routes:

- Developer website: `https://chessticize.com/`
- Support: `https://chessticize.com/support/`
- Accessibility: `https://chessticize.com/accessibility/`
- Android install guide: `https://chessticize.com/android/`

The site is served from the custom domain `chessticize.com`. Once the custom
domain is set in the repository's Pages settings, the old
`https://chessticize.github.io/chessticize-mobile/...` URLs redirect
automatically to the same path on `chessticize.com`, so existing app, store, and
shared links keep working. The web app (`app.chessticize.com`) is live and
linked as "Play online" from the homepage header, hero actions, and footer, and
from `site/404.html`.

Pages use relative asset and link paths so they work from the domain root. Only
`404.html` needs root-absolute paths because it is served for any missing URL
at any depth. It references its stylesheet and icon at both `/` and the legacy
`/chessticize-mobile/` prefix, so it also renders during the transition on the
`github.io` project path.

## Preparing the 1.6 refresh

The landing page uses approved, sanitized native 1.6 captures. The committed
WebP files are derivatives only: the original PNG captures stay in ignored
`scratch/` storage. `site/assets/marketing-assets.json` records each derivative,
its output hash, logical source collection, source hash, and capture commit.
It deliberately records no local absolute paths.

The current capture collection is App source commit
`b2ba55b8d8e1b443c82490b9e1508d733ecc9207` for iPhone, iPad, and the
genuine iPhone Duo inner display. The Duo capture also records its separate
runner commit `2c0ce5e82c6ed67c608cfd5543120d7ab6d222d6`; that is capture-runner
provenance, not the App source. These are not a claim that captures were made
from a later release or `main`.

## Updating the marketing images

The committed website images are web-sized derivatives of approved, sanitized
native captures. The raw capture PNGs and their manifests remain under the
ignored `scratch/` workspace and are not committed.

After generating and approving a new marketing set:

```sh
pnpm landing-page:assets -- \
  --source-root /absolute/path/to/app-store-raw-b2ba-normal-final \
  --duo-source-root /absolute/path/to/duo-inner-b2ba-final
```

The source directory must contain:

- `iphone-6.9-inch-portrait/{practice-home,dark-arrow-duel,tactical-profile,focused-run,survival,review}.png`;
- the matching six `ipad-13-inch-landscape/` captures;
- `iphone-duo-inner-landscape/dark-arrow-duel.png` under the Duo source root; and
- `manifest.json` in the App Store capture root and `manifest-iphoneDuo.json`
  in the Duo root. The generator stops before it changes site assets if a
  manifest path, source commit, or SHA-256 does not match its input PNG.

The command rewrites the optimized WebP images, a non-captioned contact sheet,
the site icon, and `site/assets/marketing-assets.json`. It removes only the
previously generator-owned `iphone-0*` and `ipad-0*` poster derivatives.
Review the diff and open the landing page locally before committing:

```sh
python3 -m http.server 4173 --directory site
```

Then open `http://127.0.0.1:4173/`. The local server is only a preview tool; the
published site remains plain static files.

## Updating install links

- iOS uses the stable App Store product URL
  `https://apps.apple.com/us/app/chessticize/id6788610123`.
- Android uses the stable Google Play product URL
  `https://play.google.com/store/apps/details?id=com.chessticize.mobile` as the
  primary install action after Production publication is verified. The Pages
  route `android/` remains the stable installation guide and manual APK entry
  point. Keep Google Play primary there. The Pages workflow renders
  `site/android/index.template.html` from the highest-versionCode public
  Android Release that contains exactly the source manifest, Play-signed APK,
  and checksum. A source-only candidate is deliberately skipped.

After `Publish Play-generated Android APK` completes successfully, its
`workflow_run` event triggers the Pages deployment automatically. Ordinary
Pages deployments resolve the same public Release state, so a later marketing
site update cannot roll the Android download page back to a hard-coded older
APK. If release lookup, asset identity, or checksum validation fails, the Pages
job fails and leaves the previously deployed page in place.

To render the current public mirror for local preview:

```sh
pnpm landing-page:android:render
python3 -m http.server 4173 --directory site
```

The generated `site/android/index.html` is ignored; the template and renderer
are the committed sources.

- App Store Connect uses the homepage as the Marketing URL, `support/` as the
  Support URL, and `accessibility/` as the Accessibility URL. The complete
  privacy policy remains the repository-hosted `docs/PRIVACY_POLICY.md`; the
  landing page links to that canonical policy.

The install actions use unmodified, locally served vendor artwork. Keep the
App Store badge first when both stores appear, render it at least 40 pixels
high, and preserve the transparent clear space supplied with the Google Play
badge. Do not redraw, crop, recolor, or add copy inside either badge.

- Apple source: `https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg`
  (`site/assets/download-on-the-app-store.svg`, SHA-256
  `a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f`).
- Google source: `https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png`
  (`site/assets/get-it-on-google-play.png`, SHA-256
  `f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849`).

Run the focused landing-page test and development-process validation after any
content, asset, route, or deployment change:

```sh
pnpm --filter ChessticizeMobile test -- landingPage.test.js --runInBand
pnpm process:validate
```
