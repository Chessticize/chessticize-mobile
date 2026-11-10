# Android direction, Apple creative formats

The current review candidate uses the approved Android feature graphic's
left-copy/right-product composition, cold-white and icy-blue studio palette,
and **the same 03wH4 puzzle and candidate arrows**. The previous three-piece
puzzle direction is superseded.

| Placement | Upload-sized export | Preview | Safe-area proof |
| --- | --- | --- | --- |
| Header | [3840 × 1646 RGB PNG](header-3840x1646-v3.png) | [Full composition](header-preview.jpg) | [Conservative crop](header-safe-area.jpg) |
| Search Results | [3840 × 2560 RGB PNG](search-results-3840x2560-v3.png) | [Full composition](search-results-preview.jpg) | [Conservative crop](search-results-safe-area.jpg) |

## Authentic puzzle content

The position is the existing
[`android-arrow-duel.fixture.json`](../../../../../fixtures/puzzles/android-arrow-duel.fixture.json):

`2r2b2/p5qk/1p1pR1pp/3Q4/2P4B/1PN5/P4PPP/6K1 w - -`

The two candidate moves remain **c3e4 (Ne4)** and **h4f6 (Bf6)**. The existing
approved fixture identifies Bf6 as correct and Ne4 as wrong. The renderer
executes both moves with chess.js to verify legality; this is not a new engine
strength evaluation or a claim that this puzzle is mate versus stalemate.

The artwork uses a retained **native iOS Simulator** screenshot of exactly
this position and these arrows, captured on 2026-07-25. The selected immutable
PNG is preserved in `source/ios-arrow-duel-capture.png`, with its dimensions
and checksum in `manifest.json`. It has no account data, personal rating or
real user history. The screenshot content is scaled and clipped only; no
pieces, arrows, UI copy, counters or status data are generated or repainted.

**Acceptance limit:** this is an archival UI capture. Its original build
commit was not retained; it is not evidence of the current 1.6.0 UI or native
acceptance. Its older guidance copy remains visible. Refresh that capture
before treating this design candidate as publication-ready current-version
marketing. No new Simulator was booted or native build performed for this art.

## Composition

Image generation is limited to the background plate. The supplied Android
feature graphic was the style reference; the bundled imagegen CLI explicitly
used `gpt-image-2.6-sunburst`, quality `high`. The selected plate and prompt are
retained under `source/`. Typography, the existing app icon, the handset frame,
screen mask and Dynamic Island are deterministic SVG/Sharp composition.
Handset and screen use matching continuous-curvature corners and a thin bezel.

The complete phone is visible in both full compositions. Essential copy and
the **complete 8 × 8 board with both arrows** remain inside the conservative
Apple safe rectangles. Secondary handset chrome and UI outside the board may
be cropped. The crop proofs reuse the official template geometry documented
in [v1](../creative-v1/README.md); they are not ASC device previews.

Regenerate from the repository root with installed dependencies:

```sh
node apps/mobile/store-assets/apple/creative-v3/render.mjs
```

Validation checked exact RGB/no-alpha export dimensions, source/output hashes,
both legal candidate moves, and full-image/crop visual review. No app runtime,
dependency or native code changes are included.

## Delivery

These images replace v2 as the current **design review candidates** in the PR.
They have not been uploaded, submitted, selected in live placements or
published. The rejected v1 standalone asset submission remains withdrawn.
The existing Android graphic and approved 1.6.0 app have not been changed.
