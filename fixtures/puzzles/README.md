# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

`bundled-core-pack.sqlite` is the mobile app's release-default offline Core Pack.
It is generated from the local Chessticize presolved Lichess puzzle CSV with:

```sh
pnpm generate:offline-puzzles
```

The generator reads the depth-20 `../lichess-presolve/presolved` corpus by
default, keeps source puzzle IDs, requires Stockfish presolve fields, applies
the quality and Arrow Duel eligibility filters in
`docs/PUZZLE_PACK_SAMPLING.md`, samples the 600-2200 rating range with
deterministic stratified bucket/theme quotas, removes duplicate board
positions, and writes a deterministic SQLite pack plus
`bundled-core-pack.manifest.json`. It does not synthesize puzzles by copying
existing records.

The presolver is public at
[Chessticize/lichess-presolver](https://github.com/Chessticize/lichess-presolver),
and the exact eight-part depth-20 source corpus is available from its
[`dataset-2025-07-depth20` release](https://github.com/Chessticize/lichess-presolver/releases/tag/dataset-2025-07-depth20).
See `docs/PUZZLE_PACK_SAMPLING.md` for download, checksum, decompression, and
full-rebuild entry points.

To update the presolve fields of an existing sampled pack without renewing its
IDs, run:

```sh
pnpm update:offline-puzzle-presolve
```

This targeted updater changes only the three Stockfish fields, removes rows
that no longer satisfy the full Arrow Duel eligibility rule, and performs full
artifact/manifest validation. It does not replenish removed rows.

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

`familiar-15-e2e.manifest.json` is the shared deterministic manifest for the
mobile Familiar 15 product source and its long-running E2E flows. It owns the
puzzle order, the synthetic dual-mate record, and the one accepted alternate
user move. Referenced source puzzles and their solution lines remain canonical
in `presolved-1000.json`; E2E user turns are derived from those lines.

`regression-samples.json` names stable puzzle IDs from `presolved-1000.json` for recurring regression coverage, such as promotion lines, multi-move lines, and check positions. Tests should load the real puzzle from `presolved-1000.json` by ID instead of copying full puzzle records into another fixture.

Lichess currently publishes database exports under Creative Commons CC0 on the
open database page: https://database.lichess.org/#puzzles. The fixture keeps
source IDs and URLs so attribution and provenance remain visible in tests.
Chessticize-specific fields such as `stockfishBestMove` and
`stockfishEvalAfterFirstMove` come from the public presolver pipeline linked
above.

## Core Pack distribution

`bundled-core-pack.sqlite` (~490 MiB after the depth-20 correction) is NOT
committed to git. Pack artifacts are published as immutable GitHub Release
assets and fetched on demand:

```sh
pnpm fetch:core-pack
```

The fetch verifies size and SHA-256 against `bundled-core-pack.manifest.json`
(`packFileBytes` / `packFileHash`). CI caches the artifact keyed on the
manifest; the Detox iOS build fetches it automatically. The first
`core-pack-v1` build used the wrong, lower-quality presolve input and is
superseded by the corrected depth-20 `core-pack-v2` artifact. The current
manifest and `scripts/fetch-core-pack.mjs` reference `core-pack-v2`. Publish
future updates under new immutable release tags; never overwrite an existing
Core Pack release.
