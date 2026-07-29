# App Store Assets

This document is the 1.3 source of truth for App Store Connect metadata and
store screenshot capture. Recheck Apple's live documentation before upload:

- Screenshot specifications:
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Platform version metadata fields:
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Accessibility nutrition labels:
  https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/

The canonical six-frame marketing sequence, final frame copy, and coherent
fictional-user contract are defined in
[`docs/marketing/APP_STORE_SCREENSHOT_STORY.md`](marketing/APP_STORE_SCREENSHOT_STORY.md)
and
[`config/app-store-marketing-story-v1.json`](../config/app-store-marketing-story-v1.json).
The canonical English metadata contract is
[`config/app-store-metadata-en-us-v1.json`](../config/app-store-metadata-en-us-v1.json).
The evidence-backed accessibility declaration contract is
[`config/app-store-accessibility-v1.json`](../config/app-store-accessibility-v1.json),
with the full audit in
[`docs/ACCESSIBILITY_AUDIT.md`](ACCESSIBILITY_AUDIT.md).
That sequence is separate from the maintained fifteen-scene release-QA capture
below. Its deterministic raw-capture and Cobalt Focus composition stages are
documented in
[`docs/marketing/APP_STORE_MARKETING_CAPTURE.md`](marketing/APP_STORE_MARKETING_CAPTURE.md)
and
[`docs/marketing/APP_STORE_MARKETING_COMPOSITION.md`](marketing/APP_STORE_MARKETING_COMPOSITION.md).
The existing commands and export audit in this document remain the operational
release-validation path.

## English Metadata (`en-US`)

The paste-ready values below mirror the machine-readable contract. The limits
were rechecked against Apple's official App Store Connect references on
2026-07-29. Count Unicode characters for the name, subtitle, promotional text,
description, and What's New. Count the UTF-8 keyword field against App Store
Connect's stricter 100-byte reference.

| Field | Value | Release rule |
| --- | --- | --- |
| App name | `Chessticize` | Keep the distinctive cross-platform brand; 11 / 30 characters. |
| Subtitle | `Build Tactical Intuition` | Result-oriented product promise; 24 / 30 characters. |
| Promotional text | `Practice rating-matched chess puzzles with Arrow Duel, Custom Runs, and scheduled Review—offline, without ads or an account, and open source.` | 141 / 170 characters. |
| Keywords | `chess,tactics,puzzle,trainer,offline,blunder,sprint,review,spaced repetition,elo,analysis` | 89 / 100 UTF-8 bytes; no name/subtitle duplication, no spaces after commas, and no category names or competitor terms. |
| Support URL | `https://chessticize.github.io/chessticize-mobile/support/` | Stable public support, bug-report, feature-request, and private-contact entry point. |
| Marketing URL | `https://chessticize.github.io/chessticize-mobile/` | Stable public product page with iOS and Android install paths. |
| Accessibility URL | `https://chessticize.github.io/chessticize-mobile/accessibility/` | Current support and known limitations; do not use this page to imply an undeclared feature. |
| Privacy policy URL | `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md` | Must match `docs/APP_PRIVACY_DISCLOSURE.md`. |
| Primary category | `Games` | App Store Connect selection. |
| Secondary category | `Education` | App Store Connect selection. |
| Copyright | `2026 Chessticize` | Confirm the exact legal owner in App Store Connect before submission. |

### App name decision

Keep `Chessticize`. The evaluated alternative,
`Chessticize: Chess Tactics`, is within Apple's 30-character limit, but it
turns the installed cross-platform brand into a generic keyword-bearing name.
Apple indexes the app name, subtitle, keywords, and company name. The keyword
field can therefore carry `chess`, `puzzle`, and `tactics`, while the subtitle
carries the clear user outcome, without forcing a version-bound rename. Revisit
the name only with localized search evidence or a product-page test that
justifies the brand cost. If an expanded name is tested later, prefer the more
concrete `Chessticize: Chess Puzzles` over
`Chessticize: Chess Tactics`.

### Description

Copy the complete plain-text block below into App Store Connect:

```text
Practice chess puzzles with purpose—without ads or an account.

Chessticize is a free, open-source chess puzzle trainer designed to work offline. Solve short, rating-matched puzzle Sprints to build pattern recognition. Arrow Duel turns each puzzle into a choice between two candidate moves, helping you notice and reject the tempting blunder before you play it.

SOLVE PUZZLES WITH INTENT

• Puzzle Sprint: solve a compact set of rating-matched chess puzzles against the clock.
• Arrow Duel: compare two candidate moves in the same position and choose the better one.
• Custom Runs: choose puzzle themes, pace, and difficulty for what you want to practice.

MAKE EVERY MISTAKE COUNT

Missed and unclear puzzles enter scheduled Review, bringing them back when they are due. Replay lets you revisit completed puzzles and explore positions with on-device Stockfish analysis—without changing your Rating or Review schedule.

SEE YOUR PUZZLE PRACTICE

Follow separate Ratings for Standard and Arrow Duel, review recent Runs, and filter History to revisit individual puzzles.

PRIVATE BY DESIGN

• Solve bundled puzzles without a network connection.
• No ads and no Chessticize account.
• No analytics or tracking, and no puzzle activity sent to Chessticize.
• Progress starts on your device. Private iCloud Sync can merge progress across your Apple devices and can be turned off; Chessticize does not operate a sync server or receive that data.
• Review reminders use local notifications.

OPEN SOURCE

Chessticize is published under GPL-3.0-or-later. The app includes bundled puzzle data and Stockfish for on-device analysis, with source and licenses available from the app's Settings screen and public project page.

ALSO INCLUDED

• Curated puzzle themes
• Adjustable pace, duration, and difficulty
• Optional move sounds and haptic feedback
• iPhone and iPad layouts
```

The description is 1,865 / 4,000 Unicode characters, including line breaks.
It deliberately presents user-controlled Custom Runs and ordinary
History/Ratings. It does not market Tactical Profile, inferred weaknesses, or
model-derived improvement.

### What's New

For iOS 1.3, use this ready-to-paste draft:

```text
• Create Custom Runs for the puzzle themes, pace, and difficulty you choose.
• Understand puzzle Sprint timing, mistakes, and Replay with clearer first-use guidance.
• Replay Unclear and In Review puzzles together; add sound and haptics.
```

This draft is 237 / 300 Unicode characters, including line breaks. Future
versions must use the reusable template in
[`docs/releases/RELEASE_NOTES_TEMPLATE.md`](releases/RELEASE_NOTES_TEMPLATE.md):
lead with user benefits, use two or three short bullets, omit raw URLs, and do
not call stable features experimental unless that qualification is an
intentional product promise.

This is a post-tag App Store metadata correction for
`ios-v1.3.0-build-1`. It supersedes only the store-facing What's New text. The
published source tag, GitHub Release, and customer note remain immutable
evidence of what was approved at tag time. Issue #417 must retain a screenshot
or exported metadata record showing the corrected text submitted to App Store
Connect.

## Accessibility Metadata

The 2026-07-29 audit found no accessibility feature that is ready for an
iPhone or iPad declaration under Apple's all-common-tasks rule. Leave every
feature unselected. Add the Accessibility URL above after the public page is
deployed, then retain an App Store Connect screenshot or export in issue #416
or the final #417 release evidence.

This no-declaration result is intentional. It must not be replaced by a claim
based only on labeled surrounding buttons: Standard, Arrow Duel, Review, and
Replay still expose the puzzle board as a non-operable image to assistive
technology. Larger Text, contrast, touch targets, Reduce Motion, Dark
Interface, and the final grayscale pass have focused follow-up issues recorded
in `docs/ACCESSIBILITY_AUDIT.md`.

Leaving features undeclared and adding the public Accessibility URL do not
require a new binary. Any UI or behavior fix must ship in a new version before
the resulting feature is declared.

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
