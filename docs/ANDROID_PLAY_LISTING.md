# Android Play Listing and Declarations

Status date: 2026-07-30

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
- Short description: `Offline chess puzzle trainer with rating-matched Sprints and focused practice.`
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

The version-controlled metadata check validates URL syntax but deliberately
does not access the network. Before submitting or refreshing the listing, run
the separately network-gated live check:

```sh
pnpm google-play:links:check -- \
  --live \
  --metadata config/google-play-metadata-en-us-v1.json \
  --output-dir <protected-evidence-directory>/public-links
```

The command follows redirects and fails unless the marketing, install,
support, accessibility, privacy, and source destinations all finish on
successful public HTTPS responses. When `--output-dir` is present, it writes a
timestamped receipt that binds every requested and final URL to the SHA-256 of
the canonical metadata contract. Keep this live receipt separate from the
offline listing asset-set digest because link availability can change after a
review.

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

Play Console must contain the approved 512 x 512 app icon, 1024 x 500 feature
graphic, and six sanitized phone screenshots. Tablet screenshot sets are
optional and are not part of this metadata-only listing update. Do not generate
or upload extra form factors merely because the product supports them. The
reusable six-frame story comes from
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

The phone set may use an owner-approved self-built deterministic capture, as
the iOS set uses simulator captures. Retain its source and APK identity, raw
capture checksums, composition receipt, final image checksums, explicit visual
approval, and Console evidence. Keep the already released 1.3.1 AAB/APK/source
identity separate; the screenshots do not claim binary equality with that
candidate. Do not use usernames, personal ratings, real dates, or private
history. Fictional fixture values must match the approved deterministic story.

Google Play permits up to eight screenshots per supported device type; this
contract deliberately uses six phone screenshots. Every feature graphic and
screenshot must use the contract's reviewed alt text, at most 140 Unicode
characters, without redundant prefixes such as “image of” or “photo of.”

The six phone screenshots use the Android Photo Studio layout: warm-white and
icy-blue chessboard backgrounds, a deterministic unbranded Android handset,
and one small centered circular punch-hole camera. They must not show a
Dynamic Island, pill notch, Apple logo, or any Apple-specific device cue.

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

### Exact listing handoff

After the approved phone capture and six-image composition are complete,
prepare the Console review receipt. Supply the retained release evidence for
the already published candidate separately:

```sh
pnpm google-play:listing:prepare-review -- \
  --metadata config/google-play-metadata-en-us-v1.json \
  --capture <capture-directory>/google-play-capture-manifest.json \
  --composition <composed-directory>/composition-manifest.json \
  --source-manifest <release-evidence>/android-source-manifest.json \
  --mirror-evidence <release-evidence>/android-apk-mirror-evidence.json \
  --output <protected-evidence-directory>/google-play-console-review.json
```

The command fills the candidate identity and input digests. The release owner
then changes only the receipt's review fields after comparing the exact set in
Play Console: `status` to `reviewed`, a non-placeholder `evidenceId`, the
auditable HTTPS Console `reference`, and the ISO-8601 `reviewedAt` time.

Generate and independently re-verify the final repository-to-Console handoff:

```sh
pnpm google-play:listing:handoff -- \
  --metadata config/google-play-metadata-en-us-v1.json \
  --capture <capture-directory>/google-play-capture-manifest.json \
  --composition <composed-directory>/composition-manifest.json \
  --source-manifest <release-evidence>/android-source-manifest.json \
  --mirror-evidence <release-evidence>/android-apk-mirror-evidence.json \
  --console-review <protected-evidence-directory>/google-play-console-review.json \
  --output <protected-evidence-directory>/google-play-listing-asset-set.json

pnpm google-play:listing:verify -- \
  --metadata config/google-play-metadata-en-us-v1.json \
  --capture <capture-directory>/google-play-capture-manifest.json \
  --composition <composed-directory>/composition-manifest.json \
  --source-manifest <release-evidence>/android-source-manifest.json \
  --mirror-evidence <release-evidence>/android-apk-mirror-evidence.json \
  --console-review <protected-evidence-directory>/google-play-console-review.json \
  --handoff <protected-evidence-directory>/google-play-listing-asset-set.json
```

This offline, fail-closed contract hashes the canonical locale metadata,
checked-in icon, checked-in feature graphic, approved capture manifest, exact
composition manifest, retained release source manifest, and APK mirror
evidence. It also verifies the six final phone PNG bytes, their canonical alt
text, the Play-delivered candidate identity, and the Console review binding.
The deterministic `assetSetDigest` changes if any of those fields or bytes
change.

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
