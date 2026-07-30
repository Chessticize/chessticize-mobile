# Android Play Listing and Declarations

Status date: 2026-07-29

This is the English source of truth for the Android Play listing. The
machine-readable contract is
[`config/google-play-metadata-en-us-v1.json`](../config/google-play-metadata-en-us-v1.json).
This document and that contract are review inputs, not evidence that Play
Console fields have been submitted or approved. The release owner must compare
every field with the exact signed AAB and record the completed console review
in the owner evidence described by `docs/ANDROID_PLAY_RELEASE.md`.

## Listing copy

- App name: `Chessticize`
- Default language: English (United States)
- App or game: Game
- Category: Board
- Pricing: Free
- Short description: `Build tactical intuition with offline chess puzzles and focused practice.`
- Full description:

```text
Practice chess puzzles with purpose—without ads or an account.

Chessticize is an open-source chess puzzle trainer designed to work offline. Solve short, rating-matched puzzle Sprints to build pattern recognition. Arrow Duel turns each puzzle into a choice between two candidate moves, helping you notice and reject the tempting blunder before you play it.

Solve puzzles with intent

• Puzzle Sprint: solve a compact set of rating-matched chess puzzles against the clock.
• Arrow Duel: compare two candidate moves in the same position and choose the better one.
• Custom Runs: choose puzzle themes, pace, and difficulty for what you want to practice.

Make every mistake count

Missed and unclear puzzles enter scheduled Review, bringing them back when they are due. Replay lets you revisit completed puzzles and explore positions with on-device Stockfish analysis—without changing your Rating or Review schedule.

See your puzzle practice

Follow separate Ratings for Standard and Arrow Duel, review recent Runs, and filter History to revisit individual puzzles.

Private by design

• Solve bundled puzzles without a network connection.
• No ads and no Chessticize account.
• No analytics or tracking, and no puzzle activity sent to Chessticize.
• Progress is stored on your device. Android Progress Backup can restore eligible local progress after reinstall or device transfer when Android backup is enabled; it restores progress rather than keeping multiple devices continuously synchronized.
• Review reminders use local notifications.

Open source

Chessticize is published under GPL-3.0-or-later. The app includes bundled puzzle data and Stockfish for on-device analysis, with source and licenses available from the app's Settings screen and public project page.

Also included

• Curated puzzle themes
• Adjustable pace, duration, and difficulty
• Optional move sounds and haptic feedback
• Phone, tablet, foldable, and compatible Chromebook layouts
```

- Support email: `support@chessticize.com`
- Support URL: `https://chessticize.github.io/chessticize-mobile/support/`
- Marketing URL: `https://chessticize.github.io/chessticize-mobile/`
- Android install URL: `https://chessticize.github.io/chessticize-mobile/android/`
- Accessibility URL: `https://chessticize.github.io/chessticize-mobile/accessibility/`
- Privacy policy: `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md`
- Source: `https://github.com/Chessticize/chessticize-mobile`

Do not claim cross-platform sync, exact reminder delivery, accounts, remote
analysis, telemetry, or automatic updates. Android Progress Backup is
OS-managed restore protection, not continuous synchronization.

The Play-specific character limits rechecked on the status date are 30 Unicode
characters for the app name, 80 for the short description, and 4,000 for the
full description. Google Play has no Apple-style keyword field. Keep the copy
plain, accurate, and evergreen; do not add repetitive search terms, rankings,
pricing promotions, or time-sensitive calls to action.

## Data safety

The intended answers for the exact local-first artifact are:

- Data collected: No
- Data shared: No
- Tracking or advertising: No
- Analytics or app telemetry: No
- Account creation: No
- Data deletion request mechanism: Not applicable because Chessticize does not
  collect or hold app data; local app data is removed through Android app
  storage/uninstall controls.

Android may copy the allowlisted local progress database through encrypted
cloud backup or device-to-device transfer. That is a platform system service;
Chessticize does not receive the data. Re-audit these answers against the
runtime dependency graph, merged release manifest, backup rules, and exact AAB
before completing Play Data safety. A closed, open, or Production track still
requires a completed Data safety form and privacy-policy link even when no data
is collected. Internal-only testing is exempt, but this release proceeds beyond
Internal and therefore the form is required.

## Permissions and supported devices

The production manifest intentionally has no `INTERNET` permission. Debug adds
it only for local Metro tooling. Production requests only:

- `POST_NOTIFICATIONS`, after a user opts into local review reminders on
  Android 13 and later; and
- `RECEIVE_BOOT_COMPLETED`, to restore the next inexact local reminder after
  reboot or package replacement.

The supported product envelope is Android API 24 or later on 64-bit
`arm64-v8a` and `x86_64` phones, tablets, foldables, and compatible ChromeOS
devices. The app supports portrait and landscape and resizable activities. It
does not claim Android TV, Wear OS, Automotive, or XR support. The release owner
must inspect Play's device catalog after the AAB upload and record unexpected
exclusions or unsupported form factors; do not infer device support from a
local APK alone.

## Asset contract

Play Console must contain, at minimum, the approved 512 x 512 app icon, 1024 x
500 feature graphic, and sanitized phone screenshots. Chessticize also requires
complete 7-inch and 10-inch tablet sets because those form factors are in the
supported product envelope. The reusable six-frame story comes from
`config/app-store-marketing-story-v1.json`; its Play-specific form-factor
targets and canonical alt text come from
`config/google-play-metadata-en-us-v1.json`.

Each device type receives the same six-frame order:

1. Build Tactical Intuition
2. Choose the Best Move
3. Focus Your Practice
4. Make Every Mistake Count
5. See Your Progress
6. Private. Offline. Open Source.

All three device sets remain `pending-exact-play-artifact` until their final
captures come from the exact Play-delivered Internal or Closed build. Retain
the artifact identity, raw capture checksums, composition receipt, final image
checksums, and Console upload evidence. Do not use debug controls, usernames,
personal ratings, real dates, or private history. Fictional fixture values are
allowed only when they match the approved deterministic story contract and are
produced through the public app flow.

Google Play permits up to eight screenshots per supported device type; this
contract deliberately uses six for each of phone, 7-inch tablet, and 10-inch
tablet. Every feature graphic and screenshot must use the contract's reviewed
alt text, at most 140 Unicode characters, without redundant prefixes such as
“image of” or “photo of.”

The checked-in Android launcher icon must match the approved Chessticize brand,
but a launcher resource is not by itself a Play listing asset. Asset approval
and upload remain owner-recorded console evidence.

Candidate listing assets are checked in at:

- `apps/mobile/store-assets/android/play-icon-512.png`
- `apps/mobile/store-assets/android/feature-graphic-1024x500.png`
- `apps/mobile/store-assets/android/feature-graphic-source.png` (approved high-resolution source)
- `apps/mobile/store-assets/android/render-feature-graphic.swift` (reproducible source)

Regenerate the feature graphic with:

```sh
/usr/bin/swift apps/mobile/store-assets/android/render-feature-graphic.swift \
  apps/mobile/store-assets/android/feature-graphic-1024x500.png
```

The renderer center-crops and scales the approved high-resolution source, then
emits the required 1024 x 500, 8-bit RGB PNG without an alpha channel. The
release regression executes the renderer, checks the source and output IHDRs,
and compares decoded RGB output with the checked-in candidate. The comparison
allows only a tightly bounded amount of image-rasterization drift so that macOS
rendering-stack updates do not require replacing a visually unchanged approved
asset; broader pixel changes still fail the release contract.

The release owner must approve these assets in the same review that approves
the exact-build screenshots; file presence alone is not approval evidence.

## Current official requirements checked

- [Store listing setup](https://support.google.com/googleplay/android-developer/answer/9859152):
  app name, short description, and full description allow 30, 80, and 4,000
  characters respectively, and the listing is shared across test tracks.
- [Store listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723):
  describe actual functionality, lead with the biggest benefit, avoid
  repetitive terms and unsupported promotional claims, and localize screenshot
  overlays.
- [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151):
  feature graphics are 1024 x 500 JPEG or 24-bit no-alpha PNG; screenshots are
  limited to eight per device type; graphic alt text should describe the
  important context in at most 140 characters.
- [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842):
  listing text and images must be relevant, descriptive, properly formatted,
  and non-misleading.
- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878): new apps and updates must target API 36 starting 2026-08-31; this project already targets API 36.
- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469): every published app must complete the form, including apps that collect no data.
- [Pre-launch reports](https://support.google.com/googleplay/android-developer/answer/9842757): Play runs device-lab checks after eligible artifact uploads.
- [Testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334): Internal and Closed releases distribute the Play artifact without making this ticket a public launch.
