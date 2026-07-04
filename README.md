# Chessticize Mobile

Chessticize Mobile is an offline-first, open-source iOS training app for Puzzle Sprint and Arrow Duel: timed tactics sprints, per-mode ELO, and spaced-repetition review of mistakes, all computed on device from a bundled puzzle pack.

The repository contains the React Native app shell (`apps/mobile`), a pure TypeScript domain core (`packages/core`), storage services (`packages/storage`), a stdio CLI harness (`apps/cli`), and bundled puzzle fixtures (`fixtures/puzzles`).

## Documents

- [Mobile UI Design](docs/ui-design/MOBILE_UI_DESIGN.md) — authoritative screen behavior and visual spec
- [Core Library And CLI](docs/CORE_CLI.md) — backend package layout and CLI harness
- [App Store Plan](docs/APP_STORE_PLAN.md) — active goal and milestone plan toward the 1.0 submission
- [App Store Assets](docs/STORE_ASSETS.md) — 1.0 App Store metadata and screenshot capture plan
- [TestFlight QA](docs/TESTFLIGHT_QA.md) — internal TestFlight pass checklist and evidence log
- [Privacy Policy](docs/PRIVACY_POLICY.md) — 1.0 local-only data and tracking disclosure
- [iOS Device Targets](docs/DEVICE_TARGETS.md) — 1.0 iPhone-only, portrait-only release target
- [Agent Instructions](AGENTS.md) — architecture boundary, testing philosophy, and PR workflow

## Current Implementation

The repository now includes the GUI-independent backend core, a plain stdio CLI, and the first React Native practice UI:

- `packages/core` contains sprint, puzzle, Arrow Duel, ELO, and review scheduling rules.
- `packages/storage` contains real SQLite migrations and repositories for puzzles, attempts, sprint sessions, ratings, history filters, and review queues.
- `apps/cli` exposes the core through a machine-readable JSONL protocol for E2E testing without a mobile simulator.
- `apps/mobile` contains the React Native app shell and Practice screen that reuses `react-native-chessboard`.

## Local Mobile Preview

For normal UI work, do not use the iOS simulator as the default validation loop. Run component tests and type checks first:

```sh
pnpm mobile:test
pnpm mobile:typecheck
```

To try the current app locally on iOS after Xcode and an iOS simulator runtime are installed:

```sh
cd /Users/shuz/Projects/Chessticize/chessticize-mobile
pnpm install
pnpm --filter ChessticizeMobile start -- --host 127.0.0.1 --port 8081
```

In a second terminal, replace the simulator name with one installed on your machine:

```sh
cd /Users/shuz/Projects/Chessticize/chessticize-mobile
pnpm --filter ChessticizeMobile ios --terminal dumb --no-packager --simulator "iPhone 15"
```

Use the simulator only for native behavior or final GUI checks: real gesture rendering, safe areas, Skia/chessboard rendering, animation, native module behavior, iOS build issues, Detox, or critical end-to-end acceptance.

## Support

For app issues, general feedback, or feature requests, use
https://github.com/Chessticize/chessticize-mobile/issues. If you need to reach
the project maintainers privately before a dedicated support address is added,
open a GitHub issue requesting a private contact path.

## Product Direction

- Offline-first practice app for iOS first, Android later.
- Puzzle Sprint, Arrow Duel, mistake review, spaced repetition, local ELO, history filters, and optional iCloud sync.
- Reuse an existing chessboard component instead of maintaining a custom board widget.
- Embed Stockfish for offline analysis under GPL-compatible licensing.
- Keep frontend UI code separate from a solid local backend/domain core so business logic is reusable and heavily automated-testable.

## License

Chessticize Mobile is distributed under GPL-3.0-or-later because the app embeds
Stockfish. See [LICENSE](LICENSE) for the complete GPLv3 license text and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party notices.

## Release Source Rule

Every binary submitted to App Store Connect must be built from a public tagged
source release in this repository. Do not submit an App Store binary from an
untagged commit. The release tag must identify the exact source, native code,
bundled puzzle artifact, Stockfish source, and notices used for that binary.
See [Release Source Policy](docs/RELEASE_SOURCE_POLICY.md).

Before tagging or uploading a build, run the automatable release preflight:

```sh
pnpm app-store:preflight
pnpm app-store:third-party-audit
pnpm app-store:release-manifest
```

The preflight command reports repository checks that must pass and the manual
App Store gates that still require owner or device execution. The third-party
audit checks that `THIRD_PARTY_NOTICES.md` matches the final lockfile, bundled
Stockfish artifacts, NNUE files, and Lichess puzzle manifest. The release
manifest command emits the exact source commit, iOS identity, bundled puzzle
pack metadata, Stockfish identifiers, and SHA-256 hashes for release-critical
files; save that JSON with the GitHub release or TestFlight QA evidence.
