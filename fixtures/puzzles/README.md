# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

`bundled-core-pack.sqlite` is the mobile app's release-default offline Core Pack.
It is generated from the local Chessticize presolved Lichess puzzle CSV with:

```sh
pnpm generate:offline-puzzles
```

The generator reads `../lichess-presolve/presolved-depth16` by default, keeps
source puzzle IDs, requires Stockfish presolve fields, applies the quality and
Arrow Duel eligibility filters in `docs/PUZZLE_PACK_SAMPLING.md`, samples the
600-2200 rating range with deterministic stratified bucket/theme quotas, removes
duplicate board positions, and writes a deterministic SQLite pack plus
`bundled-core-pack.manifest.json`. It does not synthesize puzzles by copying
existing records.

The release SQLite schema is intentionally runtime-only: `puzzles` keeps the
source puzzle ID, compact FEN, solution moves, rating, and presolved Stockfish
fields; `themes` and `puzzle_themes` provide the indexed theme lookup. Fields
used only during generation, such as game URL, opening tags, rating deviation,
popularity, and play count, are filtered in the candidate table and omitted from
the shipped pack.

`bundled-core-pack.json` is retained as a small development/test compatibility
fixture while the release app reads the SQLite pack through the storage-layer
puzzle source. Do not import the JSON file in release runtime code.

`presolved-1000.json` is retained as a stable regression/test fixture. It is not
the release-default mobile puzzle source.

`regression-samples.json` names stable puzzle IDs from `presolved-1000.json` for recurring regression coverage, such as promotion lines, multi-move lines, and check positions. Tests should load the real puzzle from `presolved-1000.json` by ID instead of copying full puzzle records into another fixture.

Lichess currently publishes database exports under Creative Commons CC0 on the open database page: https://database.lichess.org/#puzzles. The fixture keeps source IDs and URLs so attribution and provenance remain visible in tests. Chessticize-specific fields such as `stockfishBestMove` and `stockfishEvalAfterFirstMove` come from the local presolve pipeline.

## Core Pack distribution

`bundled-core-pack.sqlite` (~493 MB) is NOT committed to git. It is published
as a GitHub Release asset (`core-pack-v1`) and fetched on demand:

```sh
pnpm fetch:core-pack
```

The fetch verifies size and SHA-256 against `bundled-core-pack.manifest.json`
(`packFileBytes` / `packFileHash`). CI caches the artifact keyed on the
manifest; the Detox iOS build fetches it automatically. After regenerating the
pack, upload the new artifact to a new release tag and update the URL in
`scripts/fetch-core-pack.mjs`.
