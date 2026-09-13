# App Store Upload Runbook

This runbook covers authorized iOS beta uploads and public App Store release.
Follow the delivery stages in `docs/RELEASE_SOURCE_POLICY.md`. Recheck Apple's
live requirements when preparing distribution on a new/changed toolchain:

- Upload builds:
  https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- TestFlight overview:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- Xcode distribution:
  https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases

Apple currently supports uploading builds with Xcode, Swift Playground,
`altool`, or Transporter. This repository uses
`xcodebuild archive` plus `xcodebuild -exportArchive` using the checked-in
`apps/mobile/ios/ExportOptions.app-store-connect.plist`.

## Preconditions

Use a clean isolated checkout of the source being uploaded. For TestFlight,
current integrated `main` is the normal starting point; no formal RC freeze is
needed. Verify the target app identity, unused build number and signing setup.
The archive example below is for Production; Dev TestFlight requires its own
distribution-capable app configuration, not a Debug-device sideload.

Run missing environment preparation only. Reuse already successful checks:

```sh
git status --short --branch
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
pnpm app-store:signing-readiness
```

Install locked JavaScript/CocoaPods dependencies only when absent or changed.
Select automated checks through `docs/TESTING_ARCHITECTURE.md`. A beta upload
does not require full core/mobile suites to run again after a low-risk change;
reuse applicable evidence and run only affected checks. Do not skip failed
required CI or signing/artifact validation.

As of 2026-07-29, Apple's
[SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/)
require iOS and iPadOS uploads to be built with Xcode 26 or later and the iOS
and iPadOS 26 SDK or later. Stop before installing pods, building, signing, or
capturing release evidence when either command above reports an older
toolchain. Recheck Apple's live requirement immediately before the final
archive because accepted toolchains can change.

Perform native build, signing, and upload work
on a clean release Mac whose exact Xcode build is supported by App Store
Connect. Repository preparation on another checkout is not native evidence.
Record the release Mac's exact `xcodebuild -version` output and confirm that
exact Xcode build is listed as supported in the live
[App Store Connect release notes](https://developer.apple.com/help/app-store-connect/release-notes/)
before any release build.

The locked CocoaPods installer requires Homebrew Ruby 3.3. Do not run it with
macOS system Ruby or a different Ruby/CocoaPods toolchain: Ruby-dependent local
podspec evaluation can produce different lockfile checksums even when package
versions are unchanged. The installer fails before mutating `Pods` when the
active Ruby is unsupported.

GitHub Actions does not run Xcode builds or iOS Detox. Select local native
execution by uncovered risk under `docs/TESTING_ARCHITECTURE.md`. The same policy
separately governs binary reuse and reuse of unaffected test conclusions. A
squash or rebase alone does not invalidate evidence.

For selected native execution, choose the delivered identity and affected scope.
For example, a bounded Production-identity practice check uses:

```sh
CHESSTICIZE_E2E_SCOPE=practice \
  CHESSTICIZE_E2E_VARIANTS=release \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
```

Use `both` only when configuration risk spans both identities; full scope needs
a broad risk reason. TestFlight Dev and Production are both permitted. Routine
local sideloading still uses `pnpm mobile:ios:dev:device` to preserve isolation.

React Native's Hermes compiler
setting is intentionally patched to use a stable `PODS_ROOT`-based path; an
absolute checkout path in an evaluated podspec makes `Podfile.lock`
non-portable and is a release blocker, regardless of whether the dependency
versions are unchanged. The locked installer removes only a local `ios/Pods`
sandbox whose `Manifest.lock` is missing or differs from the committed
`Podfile.lock`, then runs CocoaPods in deployment mode.

After a failed check, classify the cause and use the focused failure recovery
in `docs/RELEASE_SOURCE_POLICY.md`; do not automatically restart both platforms.

Astra can review a build-specific testing note before tagging and archiving.
Final public store copy and owner approval belong to formal Production release,
not routine TestFlight delivery. Preserve the source note and manifest required
by the distribution pipeline; see `docs/RELEASE_NOTES.md`.

Production archives read `apps/mobile/release-version.json`. Do not silently
substitute the Debug-Dev development display identity. Allocate the actual
candidate's unused store identity under `docs/RELEASE_VERSIONING.md`.

Only generate `pnpm app-store:testflight-evidence` with its screenshot bundle
when that public-release evidence is relevant to changed store assets or broad
uncovered risk. A new version/build alone does not select a full bundle or QA.
Prior releases' full matrices are historical evidence, not recurring commands.
Physical-device testing follows TestFlight delivery and does not block upload.

## Public Source Tag

Create and publish the source tag for the actual app version/build before or
with distribution. Derive the name from the candidate identity; never reuse a
historical version/build example. Publish its matching source release and
`release-manifest.json`. This exact provenance does not require every test on
that commit; accepted evidence may cover unaffected behavior from prior builds.

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
2. Confirm version, build number and bundle identity match the actual candidate.
3. Confirm export compliance is accepted for
   `ITSAppUsesNonExemptEncryption = false`.
4. Optionally configure an internal TestFlight group or run the diagnostic
   checklist in `docs/TESTFLIGHT_QA.md`; neither is a release prerequisite.
5. For an App Store version update, copy the approved `Store copy` from the
   exact build-specific release-note file into **What’s New in this Version**.
   When the canonical metadata contract records an explicit post-tag correction
   for that exact source tag, use the corrected copy instead and retain
   submission evidence. App Store Connect does not expose that field for the
   first App Store version; keep the checked-in and GitHub notes in that case.
6. Before submission, recheck Apple’s live character limit, compare the saved
    text byte-for-byte with the approved file, and retain a screenshot or
    exported metadata record with the release evidence.
7. For TestFlight, finish beta availability and report processing separately.
   For public Production release, prepare the validated candidate and metadata
   for the owner's final go/no-go; reuse existing authorization for that scope.
   Do not infer public-release approval from beta upload or merge.
8. After release, compare the live App Store notes with the approved file and
    record the result. A mismatch blocks completion until corrected and
    reverified.
