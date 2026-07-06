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

## Rating Semantics

Sprint ratings use the same server-compatible Glicko-2 shape as `chessticize-server`: a new rating bucket starts at 600 with rating deviation 350 and volatility 0.06, and ratings are floored at 600. A completed sprint is one rated game against a system opponent at the user's current rating. Winning the first sprint from a fresh 600 bucket moves the rating to about 775, so cold-start calibration is intentionally much faster than a fixed-K Elo update. Failing at the floor keeps the rating at 600 while still reducing rating deviation.

## Review And History Semantics

The backend distinguishes two concepts that are both easy to call "review" in casual product discussion:

- **Analysis Review**: an unscored replay/analyze surface opened from sprint results, scheduled review results, or History. It supports retrying moves, stepping through lines, and Stockfish analysis. It must not create attempts, change ELO, or update spaced repetition scheduling.
- **Scheduled Review**: the official spaced repetition flow for puzzles that were previously missed. It records review attempts, updates the review queue, and appears in History.

Attempt history must preserve source type:

- `sprint`: an attempt made during a sprint.
- `scheduled_review`: an attempt made during official spaced repetition review.

History queries should be able to include both source types, filter by either source type, and include correct as well as wrong attempts. Analysis Review exploration is excluded from History.

Scheduled review items keep puzzle-specific scheduling state. A correct scheduled review advances the interval. A failed scheduled review resets or contracts the interval and keeps the puzzle in the review cycle. Review queues may be partitioned by mode or sprint type so that Standard, Blitz, Arrow Duel, theme sprint, and custom sprint speeds do not get mixed into a single training context.

Opening a History row should produce an Analysis Review context with the original attempt metadata and a filtered previous/next cursor. It should not create a Scheduled Review attempt unless the user explicitly starts an official due review item.

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
- `history`: filters attempts by `result`, `mode`, `since`, `puzzleId`, and attempt source when available.
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
- CLI E2E tests spawn the real CLI process, communicate only through stdio, and verify normal multi-step sprint behavior, Arrow Duel wrong-choice review output, history/review source semantics, and invalid command handling.
