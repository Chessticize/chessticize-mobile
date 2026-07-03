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

- `LICENSE` contains GPL-3.0-or-later.
- `THIRD_PARTY_NOTICES.md` is current.
- `apps/mobile/ios/StockfishEngine/Copying.txt` and
  `apps/mobile/ios/StockfishEngine/AUTHORS` are present.
- The shipped Stockfish version and bundled NNUE files are listed in
  `THIRD_PARTY_NOTICES.md`.
- The App Store binary was built from the tagged release commit.
