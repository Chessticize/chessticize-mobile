# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

Lichess currently publishes database exports under Creative Commons CC0 on the open database page: https://database.lichess.org/#puzzles. The fixture keeps source IDs and URLs so attribution and provenance remain visible in tests. Chessticize-specific fields such as `stockfishBestMove` and `stockfishEvalAfterFirstMove` come from the local presolve pipeline.
