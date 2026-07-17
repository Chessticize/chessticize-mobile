# Android Play Listing and Declarations

Status date: 2026-07-17

This is the English source of truth for the first Android Play listing. It is a
review contract, not evidence that Play Console fields have been submitted or
approved. The release owner must compare every field with the exact signed AAB
and record the completed console review in the owner evidence described by
`docs/ANDROID_PLAY_RELEASE.md`.

## Listing copy

- App name: `Chessticize`
- Default language: English (United States)
- App or game: Game
- Category: Board
- Pricing: Free
- Short description: `Offline chess puzzles, timed practice, review, and on-device analysis.`
- Full description:

  > Build practical chess pattern recognition with focused offline practice.
  > Train with Standard, Custom, and Arrow Duel modes, revisit mistakes in a
  > scheduled review queue, inspect progress in History, and analyze completed
  > positions with Stockfish on your device. Puzzle data, ratings, attempts,
  > settings, and analysis stay local. Optional review reminders are local
  > notifications. Android Progress Backup can restore eligible local progress
  > after reinstall or device transfer when Android backup is enabled.

- Support email: `support@chessticize.com`
- Website and source: `https://github.com/Chessticize/chessticize-mobile`
- Privacy policy: `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md`

Do not claim cross-platform sync, exact reminder delivery, accounts, remote
analysis, telemetry, or automatic updates. Android Progress Backup is
OS-managed restore protection, not continuous synchronization.

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
500 feature graphic, and sanitized phone screenshots. Tablet screenshots are
required by this product's supported-device declaration even where Play treats
them as optional metadata. Capture screenshots from the exact Play-delivered
Internal or Closed build and retain their source artifact/checksum. Do not use
debug controls, usernames, exact personal ratings, dates, or private history.

The checked-in Android launcher icon must match the approved Chessticize brand,
but a launcher resource is not by itself a Play listing asset. Asset approval
and upload remain owner-recorded console evidence.

Candidate listing assets are checked in at:

- `apps/mobile/store-assets/android/play-icon-512.png`
- `apps/mobile/store-assets/android/feature-graphic-1024x500.png`
- `apps/mobile/store-assets/android/render-feature-graphic.swift` (reproducible source)

The release owner must approve these assets in the same review that approves
the exact-build screenshots; file presence alone is not approval evidence.

## Current official requirements checked

- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878): new apps and updates must target API 36 starting 2026-08-31; this project already targets API 36.
- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469): every published app must complete the form, including apps that collect no data.
- [Pre-launch reports](https://support.google.com/googleplay/android-developer/answer/9842757): Play runs device-lab checks after eligible artifact uploads.
- [Testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334): Internal and Closed releases distribute the Play artifact without making this ticket a public launch.
