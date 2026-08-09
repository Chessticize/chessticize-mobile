# Puzzle Test Fixtures

`presolved-sample.json` contains a tiny deterministic fixture set derived from the local Chessticize presolved Lichess puzzle CSV. It is intentionally small and is only meant for unit, integration, and CLI E2E tests.

`bundled-core-pack.sqlite` is the mobile app's release-default offline Core Pack.
It is generated from the local Chessticize presolved Lichess puzzle CSV with:

```sh
pnpm generate:offline-puzzles
```

The generator reads the depth-20 `../lichess-presolve/presolved` corpus by
default, keeps source puzzle IDs, requires Stockfish presolve fields, applies
the Core Pack quality filters in
`docs/PUZZLE_PACK_SAMPLING.md`, samples the 600-2200 rating range with
deterministic stratified bucket/theme quotas, removes duplicate board
positions, and writes a deterministic SQLite pack plus
`bundled-core-pack.manifest.json`. It does not synthesize puzzles by copying
existing records. Promotion candidates that pass the remaining quality checks
stay available to Standard while the manifest and runtime exclude them from
Arrow Duel.

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
that no longer satisfy the Core Pack quality rule, and performs full
artifact/manifest validation. It does not replenish removed rows; promotion
candidates remain available to Standard.

The release SQLite schema is intentionally runtime-only: `puzzles` keeps the
source puzzle ID, compact position, solution moves, rating, and presolved
Stockfish fields; `themes` and `puzzle_themes` provide the indexed theme
lookup. Schema version 2 stores positions and moves as versioned BLOBs. The
`chessticize-position` v1 codec combines a 64-bit occupancy mask, side,
castling and en-passant metadata, and four-bit piece codes. The
`chessticize-uci16` v1 codec stores each UCI move in two bytes. The
single-row `pack_format` table and matching manifest fields make these codecs
explicit; the runtime still accepts a v4 TEXT pack for rollback compatibility
and rejects unknown binary versions. The 62-row `themes` catalog retains its
stable numeric IDs, while `puzzle_themes` contains relations only for the 24
themes exposed by `SERVER_CURATED_THEMES` and uses `WITHOUT ROWID`. In
particular, `endgame` remains catalog ID 20 but has no relation rows;
`hangingPiece` remains supported at catalog ID 25.

`puzzle_themes.rating` is deliberately denormalized from `puzzles.rating`; it
does not vary by theme. The covering
`(theme_id, rating, puzzle_id)` index avoids joining and sorting the large
`puzzles` table during theme-and-rating selection. See
`docs/PUZZLE_PACK_SAMPLING.md` for the measured size/query tradeoff and legacy
Run behavior. The manifest keeps all nine mate-pattern sampling counts as
provenance even when a pattern is not runtime-indexed.

Fields used only during generation, such as game URL, opening tags, popularity,
and play count, are filtered in the candidate table and omitted from the
shipped pack. Puzzle Rating Deviation is retained because Tactical Profile uses
it at runtime.

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

`bundled-core-pack.sqlite` is NOT
committed to git. Pack artifacts are published as immutable GitHub Release
assets and fetched on demand:

```sh
pnpm fetch:core-pack
```

The fetch verifies size and SHA-256 against `bundled-core-pack.manifest.json`
(`packFileBytes` / `packFileHash`). CI caches the artifact keyed on the
manifest; the Detox iOS build fetches it automatically. The first
`core-pack-v1` build used the wrong, lower-quality presolve input and is
superseded by the corrected depth-20 `core-pack-v2` artifact. `core-pack-v3`
adds immutable Puzzle Rating Deviation. `core-pack-v4` preserves the v3 puzzle
rows while shipping the optimized stable-theme relation index described above.
`core-pack-v5` preserves all v4 puzzle semantics while replacing the three
large TEXT payload columns with the versioned binary codecs.

`packVersion` is the monotonic Core Pack content version and is independent of
the SQLite schema and codec versions. Mobile builds bind their packaged and
runtime filenames to it, for example `bundled-core-pack-v5.sqlite`. iOS opens
that read-only resource directly from the application bundle. Android first
extracts the versioned APK asset into its database directory; after the current
pack opens successfully, the runtime deletes only older
`bundled-core-pack-v*.sqlite` caches and the legacy unversioned cache. Any Core
Pack content replacement must increment `packVersion`, even when its SQLite
schema is unchanged.

To convert a verified older rowid-based pack without changing puzzle rows, run:

```sh
pnpm optimize:offline-puzzles
```

The optimizer verifies the input against its manifest, works on a temporary
copy, preserves the exact 62-theme ID catalog, rebuilds only the supported
theme relations as `WITHOUT ROWID`, runs integrity and manifest validation,
then atomically installs the pack/manifest pair. A locally generated candidate
manifest must not be committed or merged until its artifact is published under
a new immutable release tag and `scripts/fetch-core-pack.mjs` is updated in the
same change. Never overwrite an existing Core Pack release.

To encode a verified legacy TEXT pack without resampling or changing puzzle
semantics, run:

```sh
pnpm encode:offline-puzzles
```

The encoder validates the input artifact and manifest, works on a temporary
copy, round-trips every position and move payload, compares length-prefixed
semantic hashes before and after conversion, runs SQLite integrity and manifest
validation, and atomically installs the pack/manifest pair.
