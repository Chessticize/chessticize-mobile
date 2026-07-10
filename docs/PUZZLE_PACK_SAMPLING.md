# Bundled Puzzle Pack Sampling Specification

Status date: 2026-07-10. Owner-approved specification for regenerating the
release Core Pack. Supersedes the first-3,000-eligible-rows behavior of
`scripts/generate-offline-puzzle-fixture.mjs`.

## Source

The canonical local presolve library at `../lichess-presolve/presolved` contains
the complete July 24, 2025 Lichess puzzle snapshot (4,824,507 rows) presolved
with Stockfish at depth 20. Columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation,
Popularity, NbPlays, Themes, GameUrl, OpeningTags, stockfish_eval,
stockfish_bestmove, stockfish_eval_after_first_move`. Lichess data is CC0;
presolve fields are Chessticize-generated.

The presolver implementation, usage guide, and dataset provenance are public in
[Chessticize/lichess-presolver](https://github.com/Chessticize/lichess-presolver).
The exact depth-20 corpus used here is published as the immutable
[`dataset-2025-07-depth20` release](https://github.com/Chessticize/lichess-presolver/releases/tag/dataset-2025-07-depth20).
That release contains eight independently decompressible CSV archives and a
`SHA256SUMS` file.

For a fresh local setup from the published corpus, run these commands from the
`chessticize-mobile` repository root. The checkout directory intentionally uses
the existing `lichess-presolve` local name expected by the build scripts:

```sh
git clone https://github.com/Chessticize/lichess-presolver.git ../lichess-presolve
mkdir -p ../lichess-presolve/presolved
cd ../lichess-presolve/presolved
gh release download dataset-2025-07-depth20 \
  --repo Chessticize/lichess-presolver
shasum -a 256 -c SHA256SUMS
unzstd lichess-puzzles-presolved-depth20-2025-07-split-*.csv.zst
```

To rebuild the presolved corpus from a Lichess puzzle export instead of using
the release, start with the public repository's
[README](https://github.com/Chessticize/lichess-presolver#readme) and
[usage guide](https://github.com/Chessticize/lichess-presolver/blob/master/docs/USAGE.md).
They document single-file and parallel full-snapshot depth-20 runs. The
published release is the reproducible input for this Core Pack; rebuilding from
a newer Lichess export creates a different source corpus and requires the full
pack validation and publishing workflow below.

`core-pack-v1` was the first Core Pack build and used the wrong, lower-quality
presolve input. It is superseded by `core-pack-v2`, which retains the sampled
puzzle IDs, refreshes their presolve fields from the canonical depth-20 release,
and removes puzzles that no longer pass the full Arrow Duel rule. Treat the
published depth-20 dataset as the only presolve source for current and future
Core Packs.

## Owner Decisions (2026-07-04)

1. **Every shipped puzzle must be Arrow Duel eligible** (the full
   `isServerCompatibleArrowDuelPuzzle` rule, including the legality checks,
   evaluated at build time). The filter removes positions where an A/B duel is
   meaningless and raises Standard-sprint quality too. Every puzzle becomes
   usable by Standard, legacy Blitz data, and Arrow Duel, and the Custom Sprint
   mode selector can never select an ineligible puzzle.
2. **Install-size budget: about 700 MB, hard cap 800 MB.** Measured density:
   431 bytes/puzzle as minified JSON; plan for ~500 bytes/row in SQLite with
   indexes. Budget therefore targets ≈ 1.4 million puzzles (cap ≈ 1.6M).
   The pack ships as a build-time-generated read-only SQLite file.
3. **Rating range 600–2200.** Below 600 and above 2200 remain for post-1.0
   optional packs. The corrected Core Pack remains sampled by design to stay
   within the install-size budget.

## Hard Filters (applied in order)

1. Presolve fields present: `stockfish_bestmove`, `stockfish_eval`,
   `stockfish_eval_after_first_move`.
2. Quality: `Popularity >= 70`, `NbPlays >= 100`, `RatingDeviation <= 100`.
3. Rating in [600, 2200].
4. Arrow Duel eligibility: full `isServerCompatibleArrowDuelPuzzle` from
   `packages/core/src/puzzle-selection-strategy.ts` (best move differs from the
   blunder, both legal, |best eval| <= 60cp, eval swing > 200cp).
5. Position dedupe on the canonical FEN (first four FEN fields), keeping the
   more popular record.

Compute candidate inventory and eligibility counts from the canonical depth-20
input whenever a full regeneration changes quotas or filters. Do not reuse
candidate-pool statistics from the first Core Pack build because its presolve
input was incorrect.

## Stratified Sampling

1. **Buckets**: sixteen 100-point rating buckets covering 600–2200. Baseline
   quota per bucket = `TOTAL_TARGET / 16` (≈ 87,500 at the 1.4M target).
2. **Shortfall redistribution**: if a bucket has fewer eligible puzzles than
   its quota, take everything it has and redistribute the remainder across the
   other buckets proportionally to their remaining inventory.
3. **Theme-family cap**: within a bucket, no single theme family may exceed
   30% of the bucket (families: mate patterns, tactical motifs, endgames,
   openings/middlegame, defensive).
4. **Theme minimums**: every theme supported by custom sprint selection must
   have at least `min(500, available)` puzzles per bucket so themed custom
   sprints never trigger the low-inventory warning in the shipping range.
5. **Mate-pattern diversity guard**: the Arrow Duel filter can remove mate
   patterns unevenly. Compute availability from the canonical depth-20 input;
   to preserve pattern variety, each named mate-pattern theme (`backRankMate`,
   `smotheredMate`,
   `anastasiaMate`, `arabianMate`, `bodenMate`, `hookMate`, `dovetailMate`,
   `doubleBishopMate`, `killBoxMate`) gets a per-bucket minimum of
   `min(50, available)`. If a rare pattern is sparse, limit the minimum to the
   depth-20 available inventory and record the resulting count in the manifest.
6. **Deterministic weighted draw**: within a bucket, order candidates by
   `sha256(SEED + PuzzleId)` and draw with Popularity-proportional weighting
   until quotas are satisfied. The seed is a build input recorded in the
   manifest; rebuilding with the same seed and source must reproduce the byte
   identical pack. Final output is sorted by `PuzzleId`.

## Packaging Requirements

1. Ship the pack as a **prebuilt read-only SQLite database asset** generated at
   build time, with indexes on rating and themes. The artifact is distributed
   as a GitHub Release asset and fetched by hash via `pnpm fetch:core-pack`
   (never committed to git or LFS: a ~500 MB file in LFS would burn the free
   bandwidth quota on every CI checkout). Do not `require()` a JSON
   pack of this size (hundreds of MB in the JS heap) and do not import rows on
   first launch (minutes of device time for ~1.4M rows).
2. User data stays in the existing separate writable `DeviceSQLiteStore`
   database; the runtime queries the pack database by rating band and theme
   instead of seeding fixtures through `loadFixturePuzzles`.
3. The manifest must record: seed, per-bucket counts, per-theme counts,
   Arrow Duel count (equal to total by construction), rating range, source
   snapshot date, presolve depth, and the pack file hash.
4. `familiar15`, `presolved-1000.json`, and `regression-samples.json` remain
   unchanged as deterministic test fixtures behind the dev-only source switch.
5. Fix the known mismatch while wiring this in: `SERVER_PUZZLE_MIN_RATING`
   (800) exceeds the pack floor (600), so low-rated users' preferred selection
   windows can be empty until fallback. The selection floor must align with the
   shipped pack floor.

## Updating Presolve Data Without Resampling

Use this workflow when the sampled IDs should remain fixed but their presolve
fields need to move to a newer corpus:

```sh
pnpm update:offline-puzzle-presolve
```

The updater verifies the existing artifact against its manifest, works on a
temporary copy, and requires every shipped `PuzzleId` to exist in the new
source with the same FEN, solution moves, and rating. It changes only
`stockfish_eval`, `stockfish_bestmove`, and
`stockfish_eval_after_first_move`. Each row is rechecked with
`isServerCompatibleArrowDuelPuzzle`; rows that fail are removed from both the
puzzle and theme relations. It then runs `PRAGMA integrity_check`, rebuilds the
manifest, and performs a full second Arrow Duel validation from the resulting
SQLite database before atomically replacing the pack and manifest.

This is intentionally not a full renewal: it never adds or resamples puzzle
IDs and does not backfill rows removed by the depth-20 eligibility check. The
result may therefore contain fewer puzzles than `targetPuzzleCount`.
`core-pack-v2` is the corrected artifact produced by this workflow. Publish
future updates under new immutable release tags; never overwrite an existing
Core Pack release.

### Depth-20 correction result (2026-07-10)

- Source IDs matched: 1,400,000 / 1,400,000; source identity mismatches: 0.
- Rows with changed presolve data: 1,371,232. Updated and retained: 1,360,472.
- Rows removed after the depth-20 eligibility check: 10,760. Replacement rows:
  0.
- Changed fields: `stockfish_eval` 1,267,234;
  `stockfish_bestmove` 236,769;
  `stockfish_eval_after_first_move` 1,080,953.
- Final rows: 1,389,240; fully validated Arrow Duel rows: 1,389,240.
- SQLite integrity: `ok`; artifact size: 513,323,008 bytes; artifact SHA-256:
  `0256e4386b9d3c17287782beae81f06fd02c1687fa8081825835e418faa9e187`.
- Published release: `core-pack-v2`; the fetch script references its immutable
  `bundled-core-pack.sqlite` asset.

## Regenerating And Publishing The Pack

Follow this checklist whenever the sampling rules, seed, thresholds, or the
source presolve library change:

1. Materialize the published depth-20 release at
   `../lichess-presolve/presolved` using the source setup above, or rebuild it
   with the public presolver and verify its metadata and hashes.
2. Run `pnpm generate:offline-puzzles`. This rebuilds
   `fixtures/puzzles/bundled-core-pack.sqlite` (gitignored) and rewrites
   `bundled-core-pack.manifest.json` with the new seed, build date, counts,
   `packFileBytes`, and `packFileHash`.
3. Verify locally with the artifact present: `pnpm test` runs the real
   manifest-vs-artifact validation, and building twice from the same seed must
   produce the identical `packFileHash` (acceptance criteria below).
4. Publish the artifact to a NEW release tag (never overwrite an old tag, so
   older commits stay reproducible):

   ```sh
   gh release create core-pack-v<N> --target main --title "Core Pack v<N> (seed <SEED>)" --notes "<counts, rating range, seed, sha256>"
   gh release upload core-pack-v<N> fixtures/puzzles/bundled-core-pack.sqlite
   ```

5. Update `DEFAULT_ARTIFACT_URL` in `scripts/fetch-core-pack.mjs` to the new
   tag, and run `pnpm fetch:core-pack` once to confirm the published artifact
   verifies against the new manifest.
6. Commit the manifest and the fetch-script URL together in one PR (never the
   `.sqlite`). The CI cache invalidates automatically because its key hashes
   the manifest.

How the artifact enters the app binary (automatic — no per-resample steps):
the iOS project's Copy Bundle Resources and the Android `build.gradle` assets
both reference the fixed path `fixtures/puzzles/bundled-core-pack.sqlite`, and
every build path (`ios-build-for-detox.sh`, the CI fetch step, release builds)
runs `pnpm fetch:core-pack` before compiling, so whatever verified artifact
sits at that path is copied into the app bundle. Consequently the filename and
path are load-bearing: a re-sampled pack must keep the name
`bundled-core-pack.sqlite` (only the release tag and hashes change). Renaming
it requires touching the Xcode project, the Android build, the fetch script,
the runtime `openReadOnlyPuzzlePack` calls, and the asset test — don't.

## Acceptance Criteria

- Every puzzle in the pack passes `isServerCompatibleArrowDuelPuzzle` (verify
  in a build-time validation pass, not by sampling).
- Manifest counts match the database contents exactly.
- For a full regeneration, per-bucket, per-theme, and mate-pattern minimums are
  met or equal the full available inventory. A targeted presolve update instead
  preserves the original IDs and does not refill newly ineligible rows.
- Two consecutive builds from the same source and seed produce identical
  hashes.
- Install-size measurement of the built asset is ≤ 800 MB, target ≈ 700 MB;
  record the final number in the manifest and `docs/STORE_ASSETS.md`.
- App cold start with the pack asset present stays within current startup
  benchmarks (no full-pack loading at launch), and the relaunch-persistence
  E2E suite stays green.
