# Chessticize Mobile

Chessticize Mobile is the planned offline-first, open-source mobile app for Puzzle Sprint and Arrow Duel.

The current repository starts with product and engineering planning only. The app implementation will be added after the architecture spike validates the React Native chessboard, local SQLite storage, embedded Stockfish, and iOS GUI test path.

## Documents

- [Phased Execution Plan](docs/PHASED_EXECUTION_PLAN.md)
- [Agent Instructions](AGENTS.md)

## Product Direction

- Offline-first practice app for iOS first, Android later.
- Puzzle Sprint, Arrow Duel, mistake review, spaced repetition, local ELO, history filters, and optional iCloud sync.
- Reuse an existing chessboard component instead of maintaining a custom board widget.
- Embed Stockfish for offline analysis under GPL-compatible licensing.
- Keep frontend UI code separate from a solid local backend/domain core so business logic is reusable and heavily automated-testable.

## License

This project is intended to be released under GPL-3.0-or-later because the app embeds Stockfish. Final release packaging must include complete license notices, source availability, and build instructions for all GPL-covered components.
