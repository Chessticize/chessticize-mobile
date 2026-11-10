# Android Privacy Disclosure

This document records the Android Local-First Release privacy position for the
Play Data Safety review and other Android distribution disclosures.

## Data handling

- Chessticize Mobile does not create a Chessticize account.
- Ratings, attempts, sprint sessions, review state, and settings are stored in a
  local SQLite progress database so practice works offline.
- Android-managed backup may copy that progress database for encrypted cloud
  restore or supported device-to-device transfer. Android and the user's device
  settings control availability and retention; Chessticize does not receive the
  backup data.
- Android Progress Backup is restore protection, not continuous synchronization
  between active devices. It does not enable transfer between Android and iOS
  or any other cross-platform transfer.
- Puzzle packs, Stockfish networks, caches, logs, temporary files, generated
  output, and test fixtures are not included in Android Progress Backup.

## Zero App Telemetry

The Android app contains no analytics, crash-reporting, advertising, tracking,
or remote telemetry SDK. It does not upload gameplay, ratings, history, or
device identifiers to a Chessticize service. Google Play platform signals such
as Android Vitals are outside the app's data pipeline.

## Optional Google Play reviews

Android uses `com.google.android.play:review:2.0.2` to invoke Google Play's own
review flow. Eligibility and the last-attempt version/time remain local; no
practice history is passed to that API. Google Play processes any rating and
free-text review the user chooses to submit in its own process. Submitted
reviews can be public, or private to the developer for a closed test track;
users can delete them through Google Play or their Google Account. The app
receives no rating, submission, or sheet-display result.

See Google's [In-App Review data-safety guidance](https://developer.android.com/guide/playcore/in-app-review#data-safety)
and the public [privacy policy](PRIVACY_POLICY.md). Review the current Play Data
Safety form against this optional store-owned flow when submitting 1.6.1; do
not treat the platform review UI as an app analytics or gameplay-upload feature.

## Release review

Before release, verify the exact artifact's backup rules, measure the real
progress payload against the 20 MiB release contract and 25 MiB Android quota,
rerun encrypted-cloud and D2D restore evidence, audit runtime dependencies for
data egress, and confirm Play Data Safety text remains consistent with this
document, [the Play listing contract](ANDROID_PLAY_LISTING.md), and
[the privacy policy](PRIVACY_POLICY.md). The production Android manifest has no
`INTERNET` permission; debug adds it only for local Metro tooling.
