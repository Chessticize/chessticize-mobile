# App Store Assets

This document is the 1.0 source of truth for App Store Connect metadata and
store screenshot capture. Recheck Apple's live documentation before upload:

- Screenshot specifications:
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Platform version metadata fields:
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

## Metadata Draft

| Field | Value | Release rule |
| --- | --- | --- |
| App name | `Chessticize` | Final App Store display name. |
| Subtitle | `Offline chess tactics` | Must stay at or below 30 characters. |
| Promotional text | `Practice chess tactics offline with Puzzle Sprint, Arrow Duel, mistake review, local ratings, and on-device Stockfish analysis.` | Must stay at or below 170 characters. |
| Keywords | `chess,tactics,puzzles,offline,stockfish,sprint,review,training,elo,analysis` | Must stay at or below 100 bytes, and must not duplicate the app name or use other app/company names. |
| Support URL | `https://github.com/Chessticize/chessticize-mobile` | Must be public and lead users to support/contact information. |
| Marketing URL | `https://github.com/Chessticize/chessticize-mobile` | Optional; use the public project page for 1.0. |
| Privacy policy URL | `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md` | Must match `docs/APP_PRIVACY_DISCLOSURE.md`. |
| Primary category | `Games` | App Store Connect selection. |
| Secondary category | `Education` | App Store Connect selection. |
| Copyright | `2026 Chessticize` | Confirm the exact legal owner in App Store Connect before submission. |

## Description Draft

Chessticize is an offline chess tactics trainer built for short, focused
practice.

Train with Puzzle Sprint, compare tactical choices in Arrow Duel, review your
mistakes with spaced repetition, and analyze positions with on-device
Stockfish. Your puzzle progress, ratings, history, and review queue stay on
your device, so practice works without an account or network connection.

Included in 1.0:

- Standard Puzzle Sprint and Arrow Duel
- Local ratings per sprint type
- Mistake history and a scheduled review queue
- On-device Stockfish analysis
- Bundled offline puzzle pack
- Local-only progress with reset and export controls

Chessticize Mobile is free and open source.

## Screenshot Requirements

The app targets iPhone and iPad for 1.0. The current automated capture plan
covers the required iPhone screenshots; iPad App Store screenshots need a
dedicated capture pass before submission. The original 1.0 plan called out 6.7"
and 6.1" minimum iPhone coverage.
Apple's current screenshot reference, rechecked on 2026-07-04, lists 6.9" as
the required iPhone display group when the app runs on iPhone, with accepted
portrait sizes `1260 x 2736`, `1290 x 2796`, and `1320 x 2868` pixels. The
current 6.1" group accepts portrait sizes
including `1170 x 2532`, `1125 x 2436`, and `1080 x 2340` pixels.

Release rule:

1. Capture or export a complete 6.9" iPhone set first.
2. Capture or export a 6.1" iPhone set as the compact verification set.
3. If App Store Connect accepts scaled screenshots for intermediate iPhone
   groups, rely on Apple's scaling only after confirming the uploaded 6.9" and
   6.1" assets preview correctly.
4. Do not upload debug screenshots that expose the development puzzle-source
   switch, Metro overlays, local paths, or user-private data.

## Bundled Puzzle Pack Measurement

The release Core Pack is generated as `fixtures/puzzles/bundled-core-pack.sqlite`
and copied into the native app bundle as a read-only SQLite database asset. The
2026-07-04 generated pack contains 1,400,000 Arrow Duel eligible puzzles across
the 600-2200 rating range. Its measured artifact size is `517,369,856` bytes
(`493.40 MiB`), below the 800 MB hard cap in
`docs/PUZZLE_PACK_SAMPLING.md`. The manifest records the exact file hash and
per-bucket/theme counts.

## Screenshot Set

Use a release or production-like build, not a Metro debug screenshot. Capture
the same six scenes for both required display groups:

1. Practice home with local ratings and the bundled offline pack.
2. Standard Puzzle Sprint with the board, timer, progress, and mistake counter.
3. Arrow Duel with both candidate arrows visible.
4. Post-sprint results with Review highlighted when mistakes exist.
5. Mistake review with the Analysis panel and Stockfish candidate lines.
6. History with the required time range and rating-key filters visible.

Save local raw captures under `scratch/store-assets/raw/`. The `scratch/`
folder is ignored and may contain private iteration artifacts. Only commit
final store-ready screenshots if they are intentionally reviewed, sanitized,
and named by display group.

## Automated Capture

The Detox capture spec is opt-in so normal Mobile iOS CI does not spend time on
store-asset screenshots. Build the app bundle, then run the capture flow for
the simulator size you are validating:

```sh
pnpm mobile:e2e:build:ios
DETOX_IOS_DEVICE="iPhone 17 Pro Max" pnpm mobile:e2e:store-assets:ios
DETOX_IOS_DEVICE="iPhone 17e" pnpm mobile:e2e:store-assets:ios
```

The script sets `CHESSTICIZE_CAPTURE_STORE_ASSETS=1` and captures these named
Detox screenshots:

| Screenshot name | Store scene |
| --- | --- |
| `app-store-01-practice-home` | Practice home with local ratings and bundled offline pack context. |
| `app-store-02-standard-sprint` | Standard Puzzle Sprint board, timer, progress, and mistakes. |
| `app-store-03-arrow-duel` | Arrow Duel board with both candidate choices available. |
| `app-store-04-sprint-results` | Post-sprint result with mistake review available. |
| `app-store-05-mistake-review-analysis` | Mistake review with Stockfish analysis lines. |
| `app-store-06-history` | History with recorded wrong moves and performance context. |

Raw Detox artifacts are written under `apps/mobile/artifacts/store-assets/`.
Move private iteration captures into `scratch/store-assets/raw/` if you need to
keep local evidence. Do not commit Detox artifacts or unsanitized screenshots.
Before App Store Connect upload, export or crop final images to the exact
current Apple pixel requirements for the target display groups. Do not use the
`iPhone 17` simulator as the compact 6.1" upload source: its raw screenshots are
`1206 x 2622`, which are useful for layout review but are not one of the
accepted 6.1" portrait sizes checked by `pnpm app-store:screenshot-audit`.

## Final Screenshot Audit

After final export or cropping, place the upload-ready screenshots under
`scratch/store-assets/final/` with this structure:

```text
scratch/store-assets/final/
  iphone-6.9/
    app-store-01-practice-home.png
    app-store-02-standard-sprint.png
    app-store-03-arrow-duel.png
    app-store-04-sprint-results.png
    app-store-05-mistake-review-analysis.png
    app-store-06-history.png
  iphone-6.1/
    app-store-01-practice-home.png
    app-store-02-standard-sprint.png
    app-store-03-arrow-duel.png
    app-store-04-sprint-results.png
    app-store-05-mistake-review-analysis.png
    app-store-06-history.png
```

Then run:

```sh
pnpm app-store:screenshot-audit
```

The audit verifies that both required display groups are present, every named
scene exists exactly once per group, and each image is a `.png`, `.jpg`, or
`.jpeg` file using one of Apple's accepted portrait sizes for that group. Use
`-- --root PATH` to audit a different local export directory.

## Capture Checklist

- Use portrait orientation for the required App Store scene set audited here.
- Capture separate landscape/iPad QA evidence for the adaptive orientation pass
  before release sign-off.
- Use the clean release palette and current app icon.
- Keep all screenshots in English.
- Prefer deterministic fixture data so ratings, history, and review states are
  coherent across screenshots.
- Re-run the relevant mobile component tests after any UI copy or layout change
  made only for screenshots.
- Before upload, compare every screenshot against the current Apple screenshot
  specifications page linked above.
