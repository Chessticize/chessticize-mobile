# Release Source Policy

Chessticize Mobile embeds Stockfish and is distributed as GPL-3.0-or-later.
Every binary submitted to App Store Connect or Google Play must have a matching
public source release.

## Required Rule

For each submitted binary:

1. Ensure the working tree is clean and the release commit contains the exact
   source, native code, bundled puzzle artifact, Stockfish source, and notices
   used for the binary.
2. Create a signed or annotated platform repository tag for the submitted
   version and build, for example `ios-v1.0.0-build-1` or
   `android-v1.1.0-build-1`.
3. Publish a GitHub release for that tag before or at the same time as App
   Store submission.
4. Mention the tag and public repository URL in release notes and support
   documentation so recipients can obtain the corresponding source.
5. Do not submit a binary built from an untagged commit. A Play Internal or
   Closed candidate is still a distributed binary and follows this rule.

## Current Public Source Location

The public repository is:

https://github.com/Chessticize/chessticize-mobile

## Release Checklist

- Run `pnpm app-store:preflight` and resolve any failed automatable checks.
- Run `pnpm app-store:signing-readiness` on the upload machine and resolve any
  missing Apple Developer Team ID, Xcode, or Apple distribution identity before
  archiving.
- Record the release validation scope from `docs/TESTING_ARCHITECTURE.md`.
  Ordinary deltas use exact-head fast checks plus owner physical-device smoke;
  targeted changes run the affected native suite, and only broad native changes
  require both `flows` and `practice`.
- Run `pnpm app-store:third-party-audit` from the final lockfile and resolve
  any stale package, Stockfish, NNUE, or puzzle-data notice.
- When screenshots or store metadata changed, run
  `pnpm app-store:screenshot-audit` after final export and resolve any missing
  scene or invalid pixel size before uploading screenshots.
- Run `pnpm app-store:release-manifest` from the clean release commit and save
  the JSON output with the GitHub release or the TestFlight QA evidence.
- For first launch, a new App Store version, screenshot/metadata changes, or
  broad native risk, run
  `pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final`
  from the clean candidate commit to collect the full evidence bundle.
- Follow `docs/APP_STORE_UPLOAD.md` to archive and upload with
  `apps/mobile/ios/ExportOptions.app-store-connect.plist`.
- `LICENSE` contains GPL-3.0-or-later.
- `THIRD_PARTY_NOTICES.md` is current.
- `apps/mobile/native/stockfish/Copying.txt` and
  `apps/mobile/native/stockfish/AUTHORS` are present.
- The shipped Stockfish version and bundled NNUE files are listed in
  `THIRD_PARTY_NOTICES.md`.
- The App Store binary was built from the tagged release commit.
- For Android, follow `docs/ANDROID_PLAY_RELEASE.md` and retain the exact signed
  AAB plus artifact-only verifier output. Require the full `play-ready` evidence
  contract for first Production launch or an explicitly full release; ordinary
  deltas use its risk-scoped path.
- The Android AAB contains `LICENSE`, `THIRD_PARTY_NOTICES.md`, Stockfish
  `COPYING.txt`, and Stockfish `AUTHORS`, plus native debug symbols.
- The Play candidate was built from the exact `android-v<version>-build-<code>`
  tagged commit and every Play track references the same AAB/version code.
- Any GitHub APK is downloaded from Play only after that version is published
  and owner-smoke-tested. It uses the same source Release and Play app-signing
  certificate; CI never rebuilds a second APK for redistribution.

## Release Manifest

`pnpm app-store:release-manifest` emits a JSON source manifest for the exact
commit being submitted. It records the source commit, suggested release tag,
iOS bundle identity, package manager, bundled puzzle pack metadata, Stockfish
version/source identifiers, and SHA-256 hashes for release-critical files such
as the lockfile, notices, privacy policy, puzzle pack, Stockfish license files,
and bundled NNUE networks.

The command refuses a dirty working tree by default. The `-- --allow-dirty`
flag is only for local review and test automation; do not use a dirty manifest
for App Store Connect, TestFlight, or a public release tag.

## Third-Party Notice Audit

`pnpm app-store:third-party-audit` verifies the runtime package inventory in
`THIRD_PARTY_NOTICES.md` against `pnpm-lock.yaml`, checks that the active
`react-native-chessboard` patch is disclosed, and confirms that the Stockfish,
NNUE, and Lichess puzzle-data notices match the bundled release artifacts.

This audit is required before tagging a submitted App Store binary. It is still
not a replacement for the release owner reading the notices against the final
submitted build, because license interpretation and App Store submission remain
human release decisions.
