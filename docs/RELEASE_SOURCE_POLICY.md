# Release Source Policy

Chessticize Mobile embeds Stockfish and is distributed as GPL-3.0-or-later.
Every binary submitted to App Store Connect must have a matching public source
release.

## Required Rule

For each submitted binary:

1. Ensure the working tree is clean and the release commit contains the exact
   source, native code, bundled puzzle artifact, Stockfish source, and notices
   used for the binary.
2. Create a signed or annotated repository tag for the submitted version and
   build, for example `ios-v1.0.0-build-1`.
3. Publish a GitHub release for that tag before or at the same time as App
   Store submission.
4. Mention the tag and public repository URL in release notes and support
   documentation so recipients can obtain the corresponding source.
5. Do not submit a binary built from an untagged commit.

## Current Public Source Location

The public repository is:

https://github.com/Chessticize/chessticize-mobile

## Release Checklist

- Run `pnpm app-store:preflight` and resolve any failed automatable checks.
- Run `pnpm app-store:third-party-audit` from the final lockfile and resolve
  any stale package, Stockfish, NNUE, or puzzle-data notice.
- Run `pnpm app-store:release-manifest` from the clean release commit and save
  the JSON output with the GitHub release or the TestFlight QA evidence.
- `LICENSE` contains GPL-3.0-or-later.
- `THIRD_PARTY_NOTICES.md` is current.
- `apps/mobile/ios/StockfishEngine/Copying.txt` and
  `apps/mobile/ios/StockfishEngine/AUTHORS` are present.
- The shipped Stockfish version and bundled NNUE files are listed in
  `THIRD_PARTY_NOTICES.md`.
- The App Store binary was built from the tagged release commit.

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
