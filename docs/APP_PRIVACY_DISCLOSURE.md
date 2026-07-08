# App Store Privacy Disclosure

This document records the App Store Connect privacy answers for Chessticize
Mobile 1.0. Re-audit these answers before every App Store submission, especially
after changing sync, accounts, telemetry, crash reporting, remote packs, or
cloud analysis.

## App Privacy Questionnaire

Recommended App Store Connect answer for 1.0:

- Data collection: **Data Not Collected**
- Tracking: **No**
- Privacy policy URL:
  `https://github.com/Chessticize/chessticize-mobile/blob/main/docs/PRIVACY_POLICY.md`

Rationale:

- The app has no accounts, ads, analytics SDK, tracking SDK, or remote telemetry.
- Puzzle data is bundled with the app.
- Sprint history, puzzle attempts, ratings, review queue state, settings, and
  reminder preferences are stored locally on device by default.
- Optional iCloud Sync stores a progress snapshot in the user's private iCloud
  account through Apple's CloudKit service. Chessticize does not operate a sync
  server, does not receive this data, and does not use it for tracking or
  analytics.
- Stockfish analysis runs on device.
- Review reminders are local notifications and do not use a push notification
  server.
- Development builds can connect to local Metro tooling; release builds must not
  depend on Metro or a Chessticize server for practice.

If a future release adds a Chessticize-operated backend, remote packs, accounts,
telemetry, or crash reporting, this answer must be updated before submission.

## iOS Privacy Manifest

The app target includes `apps/mobile/ios/ChessticizeMobile/PrivacyInfo.xcprivacy`
with:

- `NSPrivacyTracking = false`
- empty `NSPrivacyCollectedDataTypes`
- required-reason API entries currently needed by React Native and SQLite
  dependencies:
  - `NSPrivacyAccessedAPICategoryFileTimestamp` reason `C617.1`
  - `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1`
  - `NSPrivacyAccessedAPICategorySystemBootTime` reason `35F9.1`

Run the iOS build after dependency changes because CocoaPods can aggregate
additional privacy manifest reasons from pods.

## Export Compliance

`apps/mobile/ios/ChessticizeMobile/Info.plist` sets
`ITSAppUsesNonExemptEncryption` to `false`.

The 1.0 app does not implement custom encryption and does not depend on network
encryption for its offline practice, local history, local review queue, or
on-device Stockfish analysis.

## Release Gate

Before submission:

1. Build the release app from the public tagged source commit.
2. Confirm the release app can start and run a sprint in airplane mode.
3. Confirm the test-only puzzle source switch is hidden in the release build.
4. Search the release diff for new SDKs, network clients, telemetry, accounts,
   cloud sync, crash reporting, or permission prompts.
5. Confirm optional iCloud Sync still uses only the app's private CloudKit
   container and does not introduce a Chessticize-operated data collection path.
6. Re-run the privacy regression test:

   ```sh
   pnpm --filter ChessticizeMobile test -- iosPrivacy.test.js
   ```
