# Landing Page

The public Chessticize website is a zero-cost static GitHub Pages site served
from [`site/`](../site/). It uses no analytics, database, CDN, remote fonts, or
runtime JavaScript. The deployment workflow publishes that directory after a
change reaches `main`.

Public routes:

- Developer website: `https://chessticize.github.io/chessticize-mobile/`
- Support: `https://chessticize.github.io/chessticize-mobile/support/`
- Accessibility: `https://chessticize.github.io/chessticize-mobile/accessibility/`
- Android install guide: `https://chessticize.github.io/chessticize-mobile/android/`

## Updating the marketing images

The committed website images are web-sized derivatives of the approved,
sanitized App Store compositions. The App Store originals remain under the
ignored `scratch/` workspace and are not committed.

After generating and approving a new marketing set:

```sh
pnpm landing-page:assets -- \
  --source-root /absolute/path/to/marketing-hybrid-a-original-bg-v1
```

The source directory must contain:

- `iphone-6.9-inch-portrait/marketing-01-standard-sprint.png` through
  `marketing-06-trust.png`;
- the matching `ipad-13-inch-landscape` images; and
- `preview-iphone-contact-sheet.png`.

The command rewrites the optimized WebP images, the site icon, and
`site/assets/marketing-assets.json`. Review the diff and open the landing page
locally before committing:

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
  point. Keep Google Play primary there, and update the fallback APK, checksum,
  version, size, and source-release links together after the protected Android
  release workflow publishes a new Play-signed APK mirror.
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
