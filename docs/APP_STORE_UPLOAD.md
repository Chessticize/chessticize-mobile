# App Store Upload Runbook

This runbook covers the owner-executed upload step for the 1.3.4 App Store
release path. Recheck Apple's live documentation before executing it:

- Upload builds:
  https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- TestFlight overview:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- Xcode distribution:
  https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases

Apple currently supports uploading builds with Xcode, Swift Playground,
`altool`, or Transporter. This repository standardizes the 1.3.4 path on
`xcodebuild archive` plus `xcodebuild -exportArchive` using the checked-in
`apps/mobile/ios/ExportOptions.app-store-connect.plist`.

## Preconditions

Run from a clean checkout of the exact accepted release-branch commit that will
be uploaded:

```sh
git status --short --branch
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
pnpm install --frozen-lockfile
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
ruby --version
(cd apps/mobile && scripts/ios-install-pods-locked.sh)
pnpm app-store:preflight
pnpm app-store:signing-readiness
pnpm test
pnpm typecheck
pnpm mobile:test
pnpm mobile:typecheck
pnpm mobile:doctor:ios
```

As of 2026-07-29, Apple's
[SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/)
require iOS and iPadOS uploads to be built with Xcode 26 or later and the iOS
and iPadOS 26 SDK or later. Stop before installing pods, building, signing, or
capturing release evidence when either command above reports an older
toolchain. Recheck Apple's live requirement immediately before the final
archive because accepted toolchains can change.

For the 1.3.4 release, perform native build, capture, signing, and upload work
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

GitHub Actions does not run Xcode builds or iOS Detox. Local iOS native
validation is the only iOS native release gate. Select delta, targeted, or full
scope under `docs/TESTING_ARCHITECTURE.md`, then record the App source SHA,
test-runner SHA, App-input digest, App-bundle checksum, Xcode version, dedicated
simulator, build result, suite results, and clean-worktree confirmation. A
squash-merged candidate may reuse the passing PR-head App bundle when
`node apps/mobile/scripts/mobile-app-inputs.js compare` proves that its App
source is an ancestor and the App-input digest is unchanged.

Mobile runtime/domain sources, native/platform projects and native test-bundle
sources, dependency manifests, lockfiles and patches, build/release
configuration, and bundled fixtures/resources are App build inputs; a change
requires a new local build and the selected local Detox scope. Host-side specs,
selectors, assertions, screenshot/evidence collectors, and non-bundled
fixtures invalidate only their affected test evidence. Use
`CHESSTICIZE_E2E_REUSE_APP_SOURCE_SHA=<app-source-sha>` with the local E2E
runner to verify the existing bundle and rerun that scope without rebuilding.
Documentation, review metadata, agent guidance, and merge ancestry require
neither.

React Native's Hermes compiler
setting is intentionally patched to use a stable `PODS_ROOT`-based path; an
absolute checkout path in an evaluated podspec makes `Podfile.lock`
non-portable and is a release blocker, regardless of whether the dependency
versions are unchanged. The locked installer removes only a local `ios/Pods`
sandbox whose `Manifest.lock` is missing or differs from the committed
`Podfile.lock`, then runs CocoaPods in deployment mode.

After any failed complete release validation pass, perform the cross-platform
pre-retry convergence sweep in `docs/RELEASE_SOURCE_POLICY.md` before
starting another full local native run.

For first launch, a new App Store version, screenshot/metadata changes, or broad
native risk, also generate the full evidence bundle:

```sh
pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final
```

Before creating the source tag or archive, create and approve
`docs/releases/ios-v<normalized-version>-build-<build>.md` from the template in
`docs/RELEASE_NOTES.md`. Verify the exact `Store copy` against this candidate,
including its two-or-three-bullet, 300-character limit, benefit-first wording,
and absence of raw URLs. Verify the file's separate release-details link opens
the exact iOS GitHub Release. The approved file must be present in the clean
commit that is tagged and archived.

For 1.3.4, `config/app-store-metadata-en-us-v1.json` records the release
candidate's exact `currentVersionWhatsNew` copy. It must match
`docs/releases/ios-v1.3.4-build-1.md` before owner approval and tagging. Retain
the submitted metadata evidence required by `docs/STORE_ASSETS.md`.

Before archiving, record whether this is a delta, targeted, or full native
release under `docs/TESTING_ARCHITECTURE.md`. A delta requires the exact-head
fast checks above and the signed archive checks. A delta does not require a fresh
full Detox run or a physical TestFlight smoke. Record the affected simulator
suite for targeted risk, or both `flows` and `practice` for broad native risk.

The 1.3.4 candidate is explicitly **Targeted native validation**. Its bounded
delta changes iPad-on-Mac window sizing and compact landscape layout behavior.
The bundled Core Pack remains unchanged from 1.3.3. On the accepted
release-branch commit, build once and run the affected `practice` suite through
the maintained exact-head runner, then run the dedicated landscape-layout
gate:

```sh
CHESSTICIZE_E2E_SCOPE=practice \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
pnpm mobile:verify:ios:landscape-layout
```

Use a different dedicated compatible simulator name when necessary, and retain
the runner's commit, App-input digest, app-bundle checksum, Xcode version, build
result, targeted-suite result, landscape-layout result, and clean-worktree
evidence.

When the evidence command is applicable, it must report `dirty: false`,
`status: "pass"`, and `releaseReady: true`. A build-number-only delta with
unchanged store metadata and screenshots does not regenerate that bundle.

## Public Source Tag

Create and publish the source tag before or at the same time as the App Store
Connect upload. The proposed iOS 1.3.4 build-1 tag is:

```sh
git tag -a ios-v1.3.4-build-1 -m "iOS 1.3.4 build 1"
git push origin ios-v1.3.4-build-1
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
2. Confirm the uploaded build number is `1` for version `1.3.4`.
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
7. Submit the processed build after the selected local simulator scope and store
   metadata checks pass; do not wait for physical-device QA.
8. After release, compare the live App Store notes with the approved file and
    record the result. A mismatch blocks completion until corrected and
    reverified.
