# Survival Puzzle Pool Research

Status date: 2026-08-10  
Scope: Issue #492 Storybook and product-rule research only. This note does not
implement Survival selection, persistence, or runtime UI.

## Decision summary

- The current bundled Core Pack supports **16 Survival levels**, from
  `600–699` through a capped final level of `2100–2200`.
- `More levels` should list every other supported level in that range. It
  should not show disabled `2200–2299`, `2300–2399`, or higher options: the
  shipping pack has no puzzles above Rating 2200, and a disabled tile would
  incorrectly suggest that those levels can be unlocked.
- V1 may keep the 16 level boundaries in one domain constant, but should not
  copy the inventory counts into UI code. A build-time test should validate the
  level contract against the versioned pack manifest and verified SQLite
  artifact.
- No additional low-inventory cutoff is needed for the current pack. Every
  supported level has at least 47,980 Standard puzzles and 47,704 Arrow
  Duel-eligible puzzles.
- A no-repeat Run that consumes every eligible puzzle before its third mistake
  should finish successfully as **Pool cleared** and receive a **Perfect
  clear** result. An I/O, decode, or selection failure must remain an error and
  must not be reported as a clear.
- Runtime implementation must fetch puzzles in bounded batches and persist its
  traversal state. The current Sprint path selects one finite array up front,
  so it is not sufficient for a persistent Run that can span tens of thousands
  of puzzles.

## Shipping boundary

The current pack is a 1,400,000-puzzle v5 SQLite artifact. Its committed
manifest declares Rating `600–2200`, and the owner-approved sampling
specification explicitly defers puzzles below 600 and above 2200 to future
optional packs:

- [`bundled-core-pack.manifest.json`](../../fixtures/puzzles/bundled-core-pack.manifest.json)
- [`PUZZLE_PACK_SAMPLING.md`](../PUZZLE_PACK_SAMPLING.md)
- [`fixtures/puzzles/README.md`](../../fixtures/puzzles/README.md)

The artifact was downloaded with `pnpm fetch:core-pack`. The repository fetch
script verified its 164,163,584-byte size and
`sha256:4f8726cd64c8e490708f9c6b7b411dad3736d5936c0493d71fd42bbe4404a811`
digest against the committed manifest before installing it at the gitignored
`fixtures/puzzles/bundled-core-pack.sqlite` path. See
[`fetch-core-pack.mjs`](../../scripts/fetch-core-pack.mjs).

### The Rating 2200 boundary

There are exactly 996 puzzles whose Rating is 2200. The manifest generator
deliberately folds them into its final 2100 bucket by clamping bucket starts to
`maxRating - 100`; see
[`offline-puzzle-pack-metadata.mjs`](../../scripts/offline-puzzle-pack-metadata.mjs).
Consequently:

- a `2200–2299` level would contain only the single Rating value 2200 and is not
  a meaningful shipping level;
- labeling the final option `2100–2199` while querying only that range would
  silently strand the 996 Rating-2200 rows;
- V1 should keep the intended 16-level pack contract and label/query its final
  capped level as `2100–2200`.

This capped last level is the one deliberate exception to the normal
100-integer labels. If the product instead requires every label to be exactly
`N00–N99`, it should explicitly exclude the 996 Rating-2200 puzzles rather than
pretending that the pack contains a normal `2200–2299` pool.

## Exact inventory by Survival level

Standard can use every row. Arrow Duel uses the same quality-approved pack but
excludes puzzles whose candidate or required solution move is a promotion,
because arrows cannot distinguish the promotion piece. The production mobile
configuration selects `all_non_promotion`, and the SQLite source applies that
filter:

- [`mobilePractice.ts`](../../apps/mobile/src/platform/mobilePractice.ts)
- [`sqlite-puzzle-pack-source.ts`](../../packages/storage/src/sqlite-puzzle-pack-source.ts)
- [`puzzle-selection-strategy.ts`](../../packages/core/src/puzzle-selection-strategy.ts)

The committed manifest records the exact global Arrow Duel count, but its
per-bucket schema does not yet record Arrow Duel counts. The per-level Arrow
Duel numbers below therefore come from the verified v5 SQLite artifact using
the same binary promotion test used by the pack validation test in
[`puzzle-pack.test.ts`](../../packages/core/test/puzzle-pack.test.ts).

| Survival level | Puzzle | Arrow Duel eligible | Promotion candidates excluded | Arrow Duel eligible rate |
| --- | ---: | ---: | ---: | ---: |
| 600–699 | 47,980 | 47,704 | 276 | 99.42% |
| 700–799 | 61,842 | 61,452 | 390 | 99.37% |
| 800–899 | 89,565 | 89,004 | 561 | 99.37% |
| 900–999 | 92,839 | 92,221 | 618 | 99.33% |
| 1000–1099 | 93,495 | 92,854 | 641 | 99.31% |
| 1100–1199 | 94,067 | 93,484 | 583 | 99.38% |
| 1200–1299 | 92,690 | 92,164 | 526 | 99.43% |
| 1300–1399 | 93,379 | 92,927 | 452 | 99.52% |
| 1400–1499 | 93,293 | 92,788 | 505 | 99.46% |
| 1500–1599 | 93,912 | 93,484 | 428 | 99.54% |
| 1600–1699 | 93,420 | 93,046 | 374 | 99.60% |
| 1700–1799 | 91,990 | 91,606 | 384 | 99.58% |
| 1800–1899 | 91,032 | 90,693 | 339 | 99.63% |
| 1900–1999 | 91,370 | 91,037 | 333 | 99.64% |
| 2000–2099 | 90,232 | 89,917 | 315 | 99.65% |
| 2100–2200 | 88,894 | 88,588 | 306 | 99.66% |
| **Total** | **1,400,000** | **1,392,969** | **7,031** | **99.50%** |

The smallest pool is therefore the 600–699 Arrow Duel level with 47,704
eligible puzzles. Pool exhaustion remains a real finite-state boundary, but it
is not a practical reason to disable any current shipping level.

## Reproduction command

First fetch and verify the immutable release artifact:

```sh
pnpm fetch:core-pack
```

Then compute the exact inventories:

```sh
sqlite3 -header -column fixtures/puzzles/bundled-core-pack.sqlite "
WITH inventory AS (
  SELECT
    CASE
      WHEN rating >= 2100 THEN 2100
      ELSE CAST(rating / 100 AS INTEGER) * 100
    END AS bucket_min,
    CASE
      WHEN typeof(stockfish_bestmove) = 'blob'
        AND typeof(solution_moves) = 'blob'
        AND SUBSTR(HEX(stockfish_bestmove), 3, 1) = '0'
        AND SUBSTR(HEX(solution_moves), 3, 1) = '0'
      THEN 1
      WHEN typeof(stockfish_bestmove) = 'text'
        AND typeof(solution_moves) = 'text'
        AND LENGTH(TRIM(stockfish_bestmove)) = 4
        AND LENGTH(
          SUBSTR(
            TRIM(solution_moves),
            1,
            INSTR(TRIM(solution_moves) || ' ', ' ') - 1
          )
        ) = 4
      THEN 1
      ELSE 0
    END AS arrow_ok
  FROM puzzles
)
SELECT
  bucket_min,
  CASE WHEN bucket_min = 2100 THEN 2200 ELSE bucket_min + 99 END AS bucket_max,
  COUNT(*) AS puzzle_count,
  SUM(arrow_ok) AS arrow_duel_count,
  COUNT(*) - SUM(arrow_ok) AS promotion_excluded,
  printf('%.2f%%', 100.0 * SUM(arrow_ok) / COUNT(*)) AS arrow_eligible_rate
FROM inventory
GROUP BY bucket_min
ORDER BY bucket_min;
"
```

The BLOB check reads the promotion bits in the first encoded candidate and
best moves. The legacy TEXT branch is retained because the runtime and pack
validation still support rollback to the previous text format.

## `More levels` V1 rule

The level picker should behave as follows:

1. Keep `Easier`, `Recommended`, and `Harder` as the three quick choices, but
   clamp them to the supported Core Pack boundary.
2. Expanding `More levels` shows all supported levels not already present in
   those quick choices, from `600–699` through `2100–2200`.
3. When the selected Rating source is below 600 or above 2200, recommend the
   nearest available level and explain the clamp in helper copy, for example:
   `Highest available level in this puzzle pack.`
4. Do not render unsupported higher levels as disabled. Revisit the list when
   an optional high-Rating pack actually ships.
5. Do not show puzzle counts in the ordinary picker. Counts are implementation
   capacity, not a useful difficulty signal. A future diagnostics or pack
   management screen may expose them separately.

For V1, a single domain-level `SURVIVAL_LEVELS` contract is reasonable because
the app binary is already bound to a specific immutable `packVersion`. Keep the
constant beside Survival selection rules rather than in React presentation
code, and fail a build-time validation if the current pack cannot satisfy one
of its levels. Do not duplicate the table's exact counts across component
fixtures or copy.

If availability later becomes user-installable or remotely variable, extend
each manifest rating bucket with an `arrowDuelCount` and derive the enabled
level list from the installed pack. The current `PuzzlePackBucketManifest`
contains only total, theme, and mate-pattern counts; see
[`puzzle-pack.ts`](../../packages/core/src/puzzle-pack.ts).

## Pool exhaustion rule

Within one Survival Run, a puzzle ID must not repeat. Separate Runs may reuse
puzzles; global unseen puzzles can be preferred for variety, but global history
must not make a supported level permanently unavailable.

When the selected type and level have no eligible unseen puzzle left in the
current Run:

- complete the Run with terminal reason `pool_cleared`;
- keep it eligible for that type-and-level Survival best;
- show `Perfect clear` and `All {eligibleCount} solved` instead of inventing a
  third mistake;
- record the pack version, eligibility rule, eligible-count snapshot, Run seed,
  and traversal cursor/seen state so pause/resume and History remain
  reproducible.

An empty batch is only a clear after the selector proves that its persisted
eligible-count snapshot has been consumed. Database-open failures, decode
failures, interrupted reads, or an inconsistent cursor should leave the Run
recoverable and show an error/retry state.

## Runtime implementation consequence

The existing Sprint service requests a finite array whose size is derived from
`targetCorrect + maxMistakes`; see
[`practice-service.ts`](../../packages/storage/src/practice-service.ts). The
core then returns `puzzles_exhausted` when that array ends; see
[`sprint-session.ts`](../../packages/core/src/sprint-session.ts). That behavior
would falsely end an otherwise healthy Survival Run at the end of its first
batch.

Survival therefore needs a backend/domain-owned batch refill contract with a
persisted deterministic seed and cursor (or an equivalent compact traversal
state). Passing an ever-growing list of all seen IDs is not a good long-run
design: the SQLite source can handle large exclusion sets by paging and
filtering in memory, but its cost grows with the exclusion set; see
[`sqlite-puzzle-pack-source.ts`](../../packages/storage/src/sqlite-puzzle-pack-source.ts).

The Storybook design can specify `Pool cleared` and `Perfect clear` now, while
the later production implementation must prove no-repeat traversal, exact
pause/resume, final-batch exhaustion, Arrow Duel promotion exclusion, and
error-versus-clear behavior with domain and storage integration tests.
