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

**Provenance limit:** this is an archival UI capture. Its original build
commit was not retained; it is not evidence of current 1.6.0 native validation.
Its older guidance wording remains visible. The owner accepted the latest
creative pair after final visual review on 2026-11-10. This acceptance concerns
the marketing artwork; it does not establish current-version native acceptance.
No new Simulator was booted or native build performed for this art.

## Composition

Image generation is limited to the background plate. The supplied Android
feature graphic was the style reference; the bundled imagegen CLI explicitly
used `gpt-image-2.6-sunburst`, quality `high`. The selected plate and prompt are
retained under `source/`. Typography, the existing app icon, the handset frame,
screen mask and Dynamic Island are deterministic SVG/Sharp composition.
Handset and screen use matching continuous-curvature corners and a thin bezel.
The Header uses a larger handset and headline, a continuous-curvature app icon
mask, tightened headline leading, and a separately refined Image 2.6 studio
plate with the peripheral rook and knight brought inward to occupy the
horizontal wings. Search retains its accepted background and copy.

The complete phone is visible in both full compositions. Essential copy and
the **complete 8 × 8 board with both arrows** remain inside the conservative
Apple safe rectangles. Secondary handset chrome and UI outside the board may
be cropped. The Header handset is raised 15 pixels so the clipped prompt-card
bottom border no longer leaves a stray frame fragment at the safe-area top edge,
while opening breathing room between the headline and handset bezel. The Search
Results handset is raised 36 pixels so the clipped progress-counter slash no
longer leaves a stray black mark at the safe-area top edge; its complete prompt
card and board remain visible. The crop proofs reuse the official template
geometry documented in [v1](../creative-v1/README.md); they are not ASC device
previews.

Regenerate from the repository root with installed dependencies:

```sh
node apps/mobile/store-assets/apple/creative-v3/render.mjs
```

Validation checked exact RGB/no-alpha export dimensions, source/output hashes,
both legal candidate moves, and full-image/crop visual review. No app runtime,
dependency or native code changes are included.

## Delivery

Search Results was **owner-approved on 2026-11-10** and is locked at SHA-256
`69aa63962c3c705daac125549b96aff518e9f94b9758cfbb6520ae16e2828f02`.
Its PNG and preview files remain unchanged during Header revisions.
Header was accepted after the owner's final-review instruction on 2026-11-10.
Both accepted files supersede v2 and are recorded in `asc-delivery.json`.
The renderer retains this receipt and verifies both accepted image hashes.

Both files were uploaded as dedicated creative assets and submitted together:

- Header asset: `f4000019-4a1f-884b-8018-0cb9a56eb84f` (21:9).
- Search Results asset: `09c00019-4a1f-884b-8029-2e04dc250a11` (3:2).
- [Standalone review submission](https://appstoreconnect.apple.com/apps/6788610123/distribution/reviewsubmissions/details/beeffbe3-2fed-49cb-a18e-829ab607b974):
  `WAITING_FOR_REVIEW`, submitted 2026-11-10T19:18:38.247Z. ASC displayed
  **2 Items Submitted**; the official API confirmed the submission state and
  exactly two review items.

The assets have **not been approved or published**. For live 1.6.0, Apple
requires approved assets before selecting them for Header/Search Results and
publishing the placement updates. ASC device previews remain unverified until
that selection is available. See [Apple's live-version asset workflow](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets).
The rejected v1 standalone submission remains withdrawn. The Android graphic
and approved app binary have not been changed.
