# App Store Upload Runbook

This runbook covers the owner-executed upload step for the 1.0 internal
TestFlight pass. Recheck Apple's live documentation before executing it:

- Upload builds:
  https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- TestFlight overview:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- Xcode distribution:
  https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases

Apple currently supports uploading builds with Xcode, Swift Playground,
`altool`, or Transporter. This repository standardizes the 1.0 path on
`xcodebuild archive` plus `xcodebuild -exportArchive` using the checked-in
`apps/mobile/ios/ExportOptions.app-store-connect.plist`.

## Preconditions

Run from a clean `main` checkout at the exact commit that will be uploaded:

```sh
git status --short --branch
pnpm install --frozen-lockfile
pnpm app-store:preflight
pnpm app-store:signing-readiness
pnpm test
pnpm typecheck
pnpm mobile:test
pnpm mobile:typecheck
pnpm mobile:doctor:ios
pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final
```

Before archiving, manually dispatch or verify the GitHub Mobile iOS/Detox
workflow for this exact `main` commit and require both `flows` and `practice` to
pass. Record the workflow URL with the TestFlight evidence; the nightly run is
acceptable only when it tested the exact release candidate.

The evidence command must report `dirty: false`, `status: "pass"`, and
`releaseReady: true`. Keep the generated `scratch/testflight-qa/<timestamp>/`
folder for the physical-device QA record.

## Public Source Tag

Create and publish the source tag before or at the same time as the App Store
Connect upload. The suggested 1.0 build-1 tag is:

```sh
git tag -a ios-v1.0.0-build-1 -m "iOS 1.0.0 build 1"
git push origin ios-v1.0.0-build-1
```

Then publish a GitHub release for that tag and attach or copy the
`release-manifest.json` from the evidence bundle.

## Credentials

Use one of these signing/authentication paths:

- Xcode account signing: add the Apple Developer account in Xcode Settings and
  let `xcodebuild -allowProvisioningUpdates` use that account. The command
  still needs the Apple Developer Team ID, either selected in the Xcode target's
  Signing & Capabilities editor or passed as `DEVELOPMENT_TEAM`.
- App Store Connect API key: set the variables below and pass them to
  `xcodebuild` during archive/export. The API key authenticates App Store
  Connect access; signing still needs the Developer Team ID.

```sh
export APPLE_DEVELOPMENT_TEAM="XXXXXXXXXX"
export ASC_KEY_PATH="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
export ASC_KEY_ID="XXXXXXXXXX"
export ASC_ISSUER_ID="00000000-0000-0000-0000-000000000000"
```

Do not commit keys, profiles, certificates, `.p8` files, exported archives, or
IPA files.

## Archive

Create the release archive:

```sh
mkdir -p scratch/app-store/archive scratch/app-store/export

xcodebuild \
  -workspace apps/mobile/ios/ChessticizeMobile.xcworkspace \
  -scheme ChessticizeMobile \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath scratch/app-store/archive/ChessticizeMobile.xcarchive \
  DEVELOPMENT_TEAM="$APPLE_DEVELOPMENT_TEAM" \
  -allowProvisioningUpdates \
  clean archive
```

If using an App Store Connect API key, append these flags to the archive command:

```sh
-authenticationKeyPath "$ASC_KEY_PATH" \
-authenticationKeyID "$ASC_KEY_ID" \
-authenticationKeyIssuerID "$ASC_ISSUER_ID"
```

## Upload

Upload the archive to App Store Connect:

```sh
xcodebuild \
  -exportArchive \
  -archivePath scratch/app-store/archive/ChessticizeMobile.xcarchive \
  -exportPath scratch/app-store/export \
  -exportOptionsPlist apps/mobile/ios/ExportOptions.app-store-connect.plist \
  DEVELOPMENT_TEAM="$APPLE_DEVELOPMENT_TEAM" \
  -allowProvisioningUpdates
```

If using an App Store Connect API key, append the same authentication flags used
for archive.

The export options intentionally set:

- `method = app-store-connect`
- `destination = upload`
- `manageAppVersionAndBuildNumber = false`
- `uploadSymbols = true`
- `stripSwiftSymbols = true`

Do not set `testFlightInternalTestingOnly = true` for this release-candidate
upload, because the same uploaded build must remain eligible for external
TestFlight or App Store submission after the internal QA pass.

## Signing Troubleshooting

If archive fails with:

```text
Signing for "ChessticizeMobile" requires a development team.
```

then the local Xcode project/account does not have a team selected for this
archive invocation. Set `APPLE_DEVELOPMENT_TEAM` to the 10-character Apple
Developer Team ID and rerun the archive command, or open the workspace in Xcode
and select that team for the `ChessticizeMobile` target.

If Xcode also reports invalid keychain credentials such as:

```text
Invalid credentials in keychain ... missing Xcode-Username
```

remove and re-add the Apple Developer account in Xcode Settings before rerunning
the archive. The repository source, release tag, and unsigned archive can be
valid while this signing-account gate is still incomplete.

## After Upload

1. Wait for App Store Connect processing to complete.
2. Confirm the uploaded build number is `1` for version `1.0`.
3. Confirm export compliance is accepted for
   `ITSAppUsesNonExemptEncryption = false`.
4. Configure the TestFlight test information from `docs/TESTFLIGHT_QA.md`.
5. Add the build to the `Internal 1.0 QA` internal testing group.
6. Install the build from the TestFlight app on a physical iPhone and a
   representative iPad.
7. Run the full checklist in `docs/TESTFLIGHT_QA.md`.
8. Fill the evidence log with the source commit, release tag, build, device,
   tester, result, blocking issues, and evidence folder.
