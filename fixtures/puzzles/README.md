# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

`bundled-core-pack.json` contains the mobile app's release-default offline Core Pack.
It is generated from the local Chessticize presolved Lichess puzzle CSV with:

```sh
pnpm generate:offline-puzzles
```

The generator reads `../lichess-presolve/presolved-depth16` by default, keeps source
puzzle IDs, requires Stockfish presolve fields, filters to the 600-1600 rating
band, removes duplicate board positions, and writes a deterministic 3,000-puzzle
JSON pack plus `bundled-core-pack.manifest.json`. It does not synthesize puzzles
by copying existing records.

`presolved-1000.json` is retained as a stable regression/test fixture. It is not
the release-default mobile puzzle source.

`regression-samples.json` names stable puzzle IDs from `presolved-1000.json` for recurring regression coverage, such as promotion lines, multi-move lines, and check positions. Tests should load the real puzzle from `presolved-1000.json` by ID instead of copying full puzzle records into another fixture.

Lichess currently publishes database exports under Creative Commons CC0 on the open database page: https://database.lichess.org/#puzzles. The fixture keeps source IDs and URLs so attribution and provenance remain visible in tests. Chessticize-specific fields such as `stockfishBestMove` and `stockfishEvalAfterFirstMove` come from the local presolve pipeline.
