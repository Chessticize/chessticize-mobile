# Core Library And CLI

This stage adds the first GUI-independent backend core for puzzle practice. It is intentionally usable from Node tests and from a plain stdio CLI before any React Native screens exist.

## Package Layout

- `packages/core`: pure domain rules. It owns sprint configuration, multi-step puzzle state, Arrow Duel validation, ELO updates, and spaced repetition scheduling. It does not import React, React Native, SQLite, native engines, navigation, or UI code.
- `packages/storage`: SQLite-backed local backend services. It owns migrations, puzzle fixture storage, sprint sessions, attempts, ratings, history filters, and review queue persistence.
- `apps/cli`: machine-readable stdio driver for the backend. It does not contain puzzle rules; it only parses JSON commands, calls the storage-backed practice service, and writes JSON responses.
- `fixtures/puzzles`: tiny presolved Lichess-derived puzzle fixtures used by unit, integration, and CLI E2E tests.

The dependency direction is:

```text
apps/cli -> packages/storage -> packages/core
```

## Puzzle Flow

Lichess puzzle rows store the FEN before the opponent move. The first move in `solutionMoves` is applied automatically before a normal puzzle is presented. The second move begins the user's solution. Multi-step puzzles alternate between user moves and automatic opponent replies until the solution line is complete.

The sprint timer has two limits:

- The total sprint duration ends the session when it expires.
- The per-puzzle timer counts the current puzzle as wrong when it expires. That timeout can advance the sprint or fail it when the mistake limit is reached.

Arrow Duel uses the original pre-puzzle FEN. The candidate moves are:

- Correct move: the presolved Stockfish best move.
- Wrong move: the first move from the Lichess puzzle line.

When the user chooses the wrong Arrow Duel move, the review payload includes both colored arrows plus the stored punishment line prefix.

## CLI Protocol

Run the CLI with:

```sh
node --experimental-strip-types apps/cli/src/main.ts --db /tmp/chessticize-user.sqlite
```

The CLI reads one JSON object per stdin line and writes one JSON object per stdout line. It emits a ready message when startup and fixture seeding are complete.

The CLI rejects a new `startSprint` command while another sprint is active. A later UI can expose an explicit abandon/confirm flow instead of silently orphaning an active session.

Example:

```jsonl
{"command":"startSprint","mode":"standard","durationSeconds":300,"perPuzzleSeconds":20,"targetCorrect":1,"theme":"hangingPiece","now":"2026-06-20T00:00:00.000Z"}
{"command":"move","move":"e6e7","now":"2026-06-20T00:00:05.000Z"}
{"command":"move","move":"b3c1","now":"2026-06-20T00:00:10.000Z"}
{"command":"move","move":"h6c1","now":"2026-06-20T00:00:15.000Z"}
{"command":"history","result":"correct"}
{"command":"exit"}
```

Supported commands:

- `startSprint`: starts a sprint with `mode`, optional timing fields, optional target/mistake limits, optional rating/theme bounds, optional theme, and optional deterministic `now`.
- `move`: submits a normal puzzle move, with optional deterministic `now`.
- `chooseArrow`: submits an Arrow Duel candidate, with optional deterministic `now`. It uses the same backend path as `move`; the active puzzle type decides validation.
- `state`: returns the active sprint view, or `null` when no sprint is active.
- `history`: filters attempts by `result`, `mode`, `since`, and `puzzleId`.
- `dueReviews`: lists review items due by `now`, or by the current clock when omitted.
- `resetRating`: creates a new rating generation for a rating key while preserving history.
- `exit`: closes the process cleanly.

## Tests

The current focused checks are:

```sh
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

GitHub Actions runs these checks in `.github/workflows/core.yml` on pull requests and pushes to `main`.

Coverage focus:

- Core unit tests cover multi-step puzzle progression, Arrow Duel review arrows, candidate rejection, sprint success/failure, ELO floor/update behavior, default sprint rules, total and per-puzzle timeout behavior, and spaced repetition intervals.
- Storage integration tests use real `node:sqlite` databases for fixture seeding, puzzle selection, attempt history filters, due review queries, rating reset generations, transaction rollback, active sprint protection, and completed sprint persistence.
- CLI E2E tests spawn the real CLI process, communicate only through stdio, and verify normal multi-step sprint behavior, Arrow Duel wrong-choice review output, and invalid command handling.
