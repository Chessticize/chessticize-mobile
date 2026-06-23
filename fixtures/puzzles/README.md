# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

`presolved-1000.json` contains the mobile app's offline demo puzzle pack. It is generated from the local Chessticize presolved Lichess puzzle CSV with:

```sh
pnpm generate:offline-puzzles
```

The generator reads `../lichess-presolve/presolved-depth16` by default, keeps source puzzle IDs, requires Stockfish presolve fields, removes duplicate board positions, and writes a deterministic 1000-puzzle JSON fixture. It does not synthesize puzzles by copying existing records.

`regression-samples.json` names stable puzzle IDs from `presolved-1000.json` for recurring regression coverage, such as promotion lines, multi-move lines, and check positions. Tests should load the real puzzle from `presolved-1000.json` by ID instead of copying full puzzle records into another fixture.

Lichess currently publishes database exports under Creative Commons CC0 on the open database page: https://database.lichess.org/#puzzles. The fixture keeps source IDs and URLs so attribution and provenance remain visible in tests. Chessticize-specific fields such as `stockfishBestMove` and `stockfishEvalAfterFirstMove` come from the local presolve pipeline.
