# App Store Assets

This document is the 1.3 source of truth for App Store Connect metadata and
store screenshot capture. Recheck Apple's live documentation before upload:

- Screenshot specifications:
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Platform version metadata fields:
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

The canonical six-frame marketing sequence, final frame copy, and coherent
fictional-user contract are defined in
[`docs/marketing/APP_STORE_SCREENSHOT_STORY.md`](marketing/APP_STORE_SCREENSHOT_STORY.md)
and
[`config/app-store-marketing-story-v1.json`](../config/app-store-marketing-story-v1.json).
That sequence is separate from the maintained fifteen-scene release-QA capture
below. Until issues #411 and #412 implement the new capture and composition
stages, the existing commands and export audit in this document remain the
operational release-validation path.

## Metadata Draft

| Field | Value | Release rule |
| --- | --- | --- |
| App name | `Chessticize` | Final App Store display name. |
| Subtitle | `Offline chess tactics` | Must stay at or below 30 characters. |
| Promotional text | `Practice chess tactics offline with Puzzle Sprint, Arrow Duel, mistake review, local ratings, and on-device Stockfish analysis.` | Must stay at or below 170 characters. |
| Keywords | `chess,tactics,puzzles,offline,stockfish,sprint,review,training,elo,analysis` | Must stay at or below 100 bytes, and must not duplicate the app name or use other app/company names. |
| Support URL | `https://github.com/Chessticize/chessticize-mobile` | Must be public and lead users to support/contact information. |
| Marketing URL | `https://github.com/Chessticize/chessticize-mobile` | Optional; use the public project page for 1.2. |
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

Included in 1.3:

- Tactical Profiles that summarize strengths, weaknesses, and progress
- Focused Practice Runs created from tactical weaknesses
- Configurable puzzle timing and clearer Sprint guidance and outcomes
- Optional move sounds and haptic feedback
- Customizable Home screen Practice Runs with independent ELO ratings
- Curated puzzle themes with multi-theme selection
- Clear side-to-move and previous-move puzzle context
- Standard Puzzle Sprint and Arrow Duel
- Mistake history and a scheduled review queue
- Bundled offline puzzles and on-device Stockfish analysis
- Local-first progress with optional private iCloud Sync

Chessticize Mobile is free and open source.

## Screenshot Requirements

The app targets iPhone and iPad for 1.3. The current automated capture plan
covers the required 6.9" iPhone, 6.1" iPhone, and 13" iPad screenshot groups.
The original 1.0 plan called out 6.7" and 6.1" minimum iPhone coverage.
Apple's current screenshot reference, rechecked on 2026-07-28, lists 6.9" as
the required iPhone display group when the app runs on iPhone, with accepted
portrait sizes `1260 x 2736`, `1290 x 2796`, and `1320 x 2868` pixels. The
current 6.1" group accepts portrait sizes including `1170 x 2532`,
`1125 x 2436`, and `1080 x 2340` pixels. Because the app runs on iPad, also
capture a 13" iPad set. The maintained release-QA set uses accepted portrait
sizes including `2064 x 2752` and `2048 x 2732` pixels. The six-frame marketing
set defined in
[`docs/marketing/APP_STORE_SCREENSHOT_STORY.md`](marketing/APP_STORE_SCREENSHOT_STORY.md)
is landscape-first on iPad, using accepted sizes `2752 x 2064` or
`2732 x 2048` pixels.

Release rule:

1. Capture or export a complete 6.9" iPhone set first.
2. Capture or export a 6.1" iPhone set as the compact verification set.
3. Capture or export a 13" iPad set because Chessticize ships as an iPad app;
   use native landscape captures for the six-frame marketing set.
4. If App Store Connect accepts scaled screenshots for intermediate iPhone
   groups, rely on Apple's scaling only after confirming the uploaded 6.9" and
   6.1" assets preview correctly.
5. Do not upload debug screenshots that expose the development puzzle-source
   switch, Metro overlays, local paths, or user-private data.

The 1.3 release changes Practice, History, Settings, Sprint guidance, and
result presentation. Capture and inspect a fresh exact-head Release set with
the maintained fifteen-scene, twenty-six-image calibration workflow before
upload; do not reuse the 1.2 screenshot set as final 1.3 evidence.

## Bundled Puzzle Pack Measurement

The release Core Pack is generated as `fixtures/puzzles/bundled-core-pack.sqlite`
and copied into the native app bundle as a read-only SQLite database asset. The
2026-07-26 Tactical Profile pack contains 1,400,000 Arrow Duel eligible puzzles
across the 600-2200 rating range, including immutable Puzzle Rating Deviation
for every row. Its measured artifact size is `520,278,016` bytes (`496.18 MiB`),
below the 800 MB hard cap in `docs/PUZZLE_PACK_SAMPLING.md`. The manifest
records the exact file hash, Tactical Profile feature hash, and
per-bucket/theme counts. The artifact is published as the immutable
`core-pack-v3` GitHub Release asset.

## Release-QA Screenshot Set

Use a release or production-like build, not a Metro debug screenshot. Capture
the same fifteen scenes for each required display group:

1. Practice tab with local ratings and the bundled offline pack.
2. Review tab showing the local review queue state.
3. History tab showing performance and puzzle history.
4. Settings tab showing local-only settings, source, and license context.
5. Standard Puzzle Sprint with the board, timer, progress, and mistake counter.
6. Arrow Duel with both candidate arrows visible.
7. Custom Sprint setup with the complete compact configuration surface.
8. Review session with the board and scheduled puzzle context.
9. Sprint rules guidance before a Sprint starts.
10. Active-session guidance for the Sprint header.
11. Active-session guidance for the Slow timing state.
12. Active-session guidance for the Timed Out state.
13. Active-session guidance for the Unclear action.
14. Arrow Duel guidance with both candidate arrows visible.
15. Sprint result with reason, accuracy, rating, mistakes, Review impact, and
    History action.

Save local raw captures under `scratch/store-assets/raw/`. The `scratch/`
folder is ignored and may contain private iteration artifacts. Only commit
final store-ready screenshots if they are intentionally reviewed, sanitized,
and named by display group.

## Automated Capture

The Detox capture spec is opt-in so normal Mobile JS CI does not spend time on
store-asset screenshots. Release screenshot capture must use the Release
simulator app so development-only controls stay out of App Store assets. For an
exact-head visual baseline, run the calibration wrapper for the exact simulator
name and UDID you are validating:

```sh
DETOX_IOS_DEVICE="iPad Pro 11-inch (M5)" \
DETOX_IOS_DEVICE_UDID="<exact-simulator-udid>" \
DETOX_MAX_WORKERS=1 \
  .codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh
```

Set `CHESSTICIZE_IOS_PREPARE=1` when the local CocoaPods workspace or bundled
gems need to be refreshed before building the Release simulator app.

The full calibration wrapper requires a dedicated iPad simulator. It builds
once, runs separate portrait and landscape journeys through the host Simulator
rotation controls, and collects fifteen portrait plus eleven landscape PNGs.
Internally it runs `pnpm mobile:e2e:build:ios:release`, then sets
`CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait` and
`CHESSTICIZE_STORE_ASSET_ORIENTATION=landscape` for the two opt-in Detox runs.
Ordinary full-screen iPhones are portrait-only; capture their required store
sets by running the portrait journey directly. When diagnosing an already-built
Release app directly, set exactly one of those values yourself before
`pnpm mobile:e2e:store-assets:ios:release`; one direct run captures only its
selected orientation. These are simulator artifacts; the capture flow does not
install or launch a physical-device build.

| Screenshot name | Store scene |
| --- | --- |
| `app-store-01-practice-tab` | Practice tab with local ratings and bundled offline pack context. |
| `app-store-02-review-tab` | Review tab with the local review queue state. |
| `app-store-03-history-tab` | History tab with performance and puzzle history context. |
| `app-store-04-settings-tab` | Settings tab with local-only settings, source, and license context. |
| `app-store-05-standard-sprint` | Standard Puzzle Sprint board, timer, progress, and mistakes. |
| `app-store-06-arrow-duel` | Arrow Duel board with both candidate choices available. |
| `app-store-07-custom-setup` | New Run editor with a required name, compact mode and theme choices, and the default All theme selection. The stable asset name is retained for evidence continuity. |
| `app-store-08-review-session` | Active Review session with the scheduled puzzle board and progress context. |
| `app-store-09-sprint-rules-guide` | Visual QA: first-use Sprint rules before the first session. |
| `app-store-10-active-session-guide-header` | Visual QA: active-session guide step 1 and real header hierarchy. |
| `app-store-11-active-session-guide-slow` | Visual QA: active-session guide step 2 and automatic Slow timing state. |
| `app-store-12-active-session-guide-timeout` | Visual QA: active-session guide step 3 and automatic timeout consequences. |
| `app-store-13-active-session-guide-unclear` | Visual QA: active-session guide step 4 and the manual Unclear action. |
| `app-store-14-arrow-duel-guide` | Visual QA: Arrow Duel guide step 5 and both candidate arrows. |
| `app-store-15-sprint-result` | Visual QA: failed Sprint reason, accuracy, rating, mistakes, Review impact, and history action. |

The capture suite builds one deterministic active-player profile through the
public app UI before taking any screenshots. On fresh data it captures and
dismisses the Sprint rules, raises Standard difficulty to ELO 800 and Arrow
Duel difficulty to ELO 850, then advances through and captures every
first-session guide step. It records a three-mistake Arrow Duel sprint and its
result, advances the app through the screenshot-only fixed-clock launch
boundary to the next review day, and completes one scheduled review. The
resulting store story therefore includes:

- a non-default Arrow Duel rating and weekly activity on Practice;
- two reviews still due plus one completed-today result on Review;
- three wrong Sprint attempts on History, matching its default Sprint-only filter.

The Release build recognizes the fixed clock only when the native
`chessticizeStoreAssetCapture` process argument accompanies
`chessticizeTestNowMs`. This does not enable the development puzzle-source
switch, review developer controls, diagnostics, or any visible test UI. Puzzle
attempts still travel through the real board, app service, and writable SQLite
store; the local bundled pack database is consulted only by the Detox runner
to choose a known wrong Arrow Duel candidate deterministically.

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
    app-store-01-practice-tab.png
    app-store-02-review-tab.png
    app-store-03-history-tab.png
    app-store-04-settings-tab.png
    app-store-05-standard-sprint.png
    app-store-06-arrow-duel.png
    app-store-07-custom-setup.png
    app-store-08-review-session.png
  iphone-6.1/
    app-store-01-practice-tab.png
    app-store-02-review-tab.png
    app-store-03-history-tab.png
    app-store-04-settings-tab.png
    app-store-05-standard-sprint.png
    app-store-06-arrow-duel.png
    app-store-07-custom-setup.png
    app-store-08-review-session.png
  ipad-13/
    app-store-01-practice-tab.png
    app-store-02-review-tab.png
    app-store-03-history-tab.png
    app-store-04-settings-tab.png
    app-store-05-standard-sprint.png
    app-store-06-arrow-duel.png
    app-store-07-custom-setup.png
    app-store-08-review-session.png
```

Then run:

```sh
pnpm app-store:screenshot-audit
```

The audit verifies that the required iPhone and iPad display groups are present, every named
scene exists exactly once per group, and each image is a `.png`, `.jpg`, or
`.jpeg` file using one of Apple's accepted portrait sizes for that group. Use
`-- --root PATH` to audit a different local export directory.

Before upload, also do a manual visual pass on the 6.1" iPhone set, especially
the iPhone 17e capture. The automated audit verifies dimensions and file
coverage, but compact-width issues such as clipped filter chips, partially
hidden labels, or controls cut off by the visible viewport require visual
inspection.

## Capture Checklist

- Use portrait orientation for the maintained fifteen-scene release-QA set
  audited here. This does not override the six-frame marketing contract.
- Keep native iPhone QA in portrait. Capture the maintained landscape journey
  on iPad before release sign-off, and use native iPad landscape captures as
  the primary six-frame marketing set.
- Keep compact wide-short, live-resize, and foldable-sized component or
  Interaction Lab evidence even though ordinary iPhones do not rotate.
- Use the clean release palette and current app icon.
- Keep all screenshots in English.
- Prefer deterministic fixture data so ratings, history, and review states are
  coherent across screenshots.
- Re-run the relevant mobile component tests after any UI copy or layout change
  made only for screenshots.
- Before upload, compare every screenshot against the current Apple screenshot
  specifications page linked above.
