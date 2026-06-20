# Chessticize Mobile

Chessticize Mobile is the planned offline-first, open-source mobile app for Puzzle Sprint and Arrow Duel.

The current repository starts with product and engineering planning only. The app implementation will be added after the architecture spike validates the React Native chessboard, local SQLite storage, embedded Stockfish, and iOS GUI test path.

## Documents

- [Phased Execution Plan](docs/PHASED_EXECUTION_PLAN.md)
- [Mobile UI Design](docs/ui-design/MOBILE_UI_DESIGN.md)
- [Core Library And CLI](docs/CORE_CLI.md)
- [Agent Instructions](AGENTS.md)

## Current Implementation

The repository now includes the first GUI-independent backend core and a plain stdio CLI:

- `packages/core` contains sprint, puzzle, Arrow Duel, ELO, and review scheduling rules.
- `packages/storage` contains real SQLite migrations and repositories for puzzles, attempts, sprint sessions, ratings, history filters, and review queues.
- `apps/cli` exposes the core through a machine-readable JSONL protocol for early E2E testing before the React Native UI exists.

## Product Direction

- Offline-first practice app for iOS first, Android later.
- Puzzle Sprint, Arrow Duel, mistake review, spaced repetition, local ELO, history filters, and optional iCloud sync.
- Reuse an existing chessboard component instead of maintaining a custom board widget.
- Embed Stockfish for offline analysis under GPL-compatible licensing.
- Keep frontend UI code separate from a solid local backend/domain core so business logic is reusable and heavily automated-testable.

## License

This project is intended to be released under GPL-3.0-or-later because the app embeds Stockfish. Final release packaging must include complete license notices, source availability, and build instructions for all GPL-covered components.
