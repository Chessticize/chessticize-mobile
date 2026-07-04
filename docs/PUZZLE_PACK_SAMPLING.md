# Bundled Puzzle Pack Sampling Specification

Status date: 2026-07-04. Owner-approved specification for regenerating the
release Core Pack. Supersedes the first-3,000-eligible-rows behavior of
`scripts/generate-offline-puzzle-fixture.mjs`. All statistics below were
measured on 2026-07-04 against the full local presolve library.

## Source

The local presolve library at `../lichess-presolve/presolved-depth16` contains
the complete Lichess puzzle database (4,824,507 rows) presolved with Stockfish
at depth 16. Columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation,
Popularity, NbPlays, Themes, GameUrl, OpeningTags, stockfish_eval,
stockfish_bestmove, stockfish_eval_after_first_move`. Lichess data is CC0;
presolve fields are Chessticize-generated.

## Owner Decisions (2026-07-04)

1. **Every shipped puzzle must be Arrow Duel eligible** (the full
   `isServerCompatibleArrowDuelPuzzle` rule, including the legality checks,
   evaluated at build time). Rationale: 83.7% of quality-filtered puzzles pass;
   every 200-point band in 600–2200 retains 110k–396k eligible puzzles; the
   puzzles removed are dominated by already-lost positions where an A/B duel is
   meaningless, so the filter raises Standard-sprint quality too. Every puzzle
   becomes usable by Standard, Blitz, and Arrow Duel, and custom-sprint
   "Include Arrow Duel" can never hit an inventory shortage.
2. **Install-size budget: about 700 MB, hard cap 800 MB.** Measured density:
   431 bytes/puzzle as minified JSON; plan for ~500 bytes/row in SQLite with
   indexes. Budget therefore targets ≈ 1.4 million puzzles (cap ≈ 1.6M).
   The pack ships as a build-time-generated read-only SQLite file.
3. **Rating range 600–2200.** Below 600 and above 2200 remain for post-1.0
   optional packs. Note: the total eligible pool in 600–2200 is ≈ 2.65M, so
   even the 800 MB cap cannot hold everything — sampling stays mandatory.

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

Measured inventory after filters 1–4 (per 200-point band):

| Band | Quality | + Arrow Duel |
| --- | --- | --- |
| 600–800 | 160,769 | 109,793 |
| 800–1000 | 407,069 | 305,642 |
| 1000–1200 | 491,419 | 396,034 |
| 1200–1400 | 435,013 | 369,080 |
| 1400–1600 | 444,977 | 388,566 |
| 1600–1800 | 399,624 | 355,576 |
| 1800–2000 | 334,721 | 301,302 |
| 2000–2200 | 209,506 | 188,212 |
| Total | 2,883,098 | 2,414,205 |

## Stratified Sampling

1. **Buckets**: sixteen 100-point rating buckets covering 600–2200. Baseline
   quota per bucket = `TOTAL_TARGET / 16` (≈ 87,500 at the 1.4M target).
2. **Shortfall redistribution**: if a bucket has fewer eligible puzzles than
   its quota (the 600–800 buckets will), take everything it has and
   redistribute the remainder across the other buckets proportionally to their
   remaining inventory.
3. **Theme-family cap**: within a bucket, no single theme family may exceed
   30% of the bucket (families: mate patterns, tactical motifs, endgames,
   openings/middlegame, defensive).
4. **Theme minimums**: every theme supported by custom sprint selection must
   have at least `min(500, available)` puzzles per bucket so themed custom
   sprints never trigger the low-inventory warning in the shipping range.
5. **Mate-pattern diversity guard**: the Arrow Duel filter removes mate
   puzzles unevenly (measured pass rates: mateIn1 48.8%, mateIn2 65.2%,
   mateIn3 73.0%, smotheredMate 35.4%, bodenMate 48.0%, killBoxMate 49.4%,
   arabianMate 54.6%, backRankMate 65.4%). To preserve pattern variety,
   each named mate-pattern theme (`backRankMate`, `smotheredMate`,
   `anastasiaMate`, `arabianMate`, `bodenMate`, `hookMate`, `dovetailMate`,
   `doubleBishopMate`, `killBoxMate`) gets a per-bucket minimum of
   `min(50, available)`. Sparse coverage of rare patterns above ~1800 is a
   pre-existing property of the source data and is accepted.
6. **Deterministic weighted draw**: within a bucket, order candidates by
   `sha256(SEED + PuzzleId)` and draw with Popularity-proportional weighting
   until quotas are satisfied. The seed is a build input recorded in the
   manifest; rebuilding with the same seed and source must reproduce the byte
   identical pack. Final output is sorted by `PuzzleId`.

## Packaging Requirements

1. Ship the pack as a **prebuilt read-only SQLite database asset** generated at
   build time, with indexes on rating and themes. Do not `require()` a JSON
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

## Acceptance Criteria

- Every puzzle in the pack passes `isServerCompatibleArrowDuelPuzzle` (verify
  in a build-time validation pass, not by sampling).
- Manifest counts match the database contents exactly.
- Per-bucket, per-theme, and mate-pattern minimums are met or equal the full
  available inventory.
- Two consecutive builds from the same source and seed produce identical
  hashes.
- Install-size measurement of the built asset is ≤ 800 MB, target ≈ 700 MB;
  record the final number in the manifest and `docs/STORE_ASSETS.md`.
- App cold start with the pack asset present stays within current startup
  benchmarks (no full-pack loading at launch), and the relaunch-persistence
  E2E suite stays green.
