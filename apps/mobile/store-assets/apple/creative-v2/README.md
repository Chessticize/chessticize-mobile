# Two moves. One win.

A redesigned Header/Search Results pair built around a real move choice.
The Android feature graphic informed the cool-white/navy/blue palette and
emphasis on chess content. This pair uses an annotated chess diagram rather
than a phone mockup or decorative chess-piece still life.

| Placement | Export | Conservative crop proof |
| --- | --- | --- |
| Header | [3840 × 1646 PNG](header-3840x1646-v2.png) | [Safe area](header-safe-area.jpg) |
| Search Results | [3840 × 2560 PNG](search-results-3840x2560-v2.png) | [Safe area](search-results-safe-area.jpg) |

## Real puzzle

Full position: `7k/8/5KQ1/8/8/8/8/8 w - - 0 1`.
White king f6, white queen g6, black king h8; White to move.
The artwork shows the e5–h8 excerpt; all omitted squares are empty.

- `Qg7#` (`g6g7`) wins by checkmate.
- `Qf7` (`g6f7`) stalemates Black and draws.

Both moves were executed through chess.js's public API. Checkmate/stalemate
and zero legal replies were checked separately. The image deliberately keeps
both arrows blue so the solution is not given away.

The reference diagram uses the app's piece sprite, light board colors, and
ArrowCandidateOverlay style: independent straight arrows, blue `#0062CC`,
opacity 0.68, round tails and triangular heads. Generated artwork preserves
the positions, destinations, and visual direction; it is an illustration,
not a pixel-identical native screenshot.

## Generation and validation

Generated using the bundled imagegen CLI with explicit model
`gpt-image-2.6-sunburst`, quality `high`. Initial prompts and the crop refinement
prompts are in `source/`, along with the selected unmodified generated PNGs
and exact puzzle reference. The Android style input is
`../../android/feature-graphic-1024x500.png`.

Sharp resized the selected originals to Apple's exact dimensions and exported
sRGB RGB PNGs without alpha; no content was retouched after generation.
`manifest.json` records output/source hashes, sizes, puzzle validation, and
safe-area coordinates. Visual review checked the three piece locations,
both arrow destinations, copy, full image, and conservative safe-area crops.
No application behavior changed; native/build/E2E validation is not applicable.

The conservative crop rectangles reuse the official Apple template geometry
recorded in [creative-v1](../creative-v1/README.md). They are crop proofs, not
App Store Connect device previews or live-placement evidence.

## Delivery state

These are review candidates, not published replacements. No v2 images have
been uploaded or submitted to Apple. The rejected v1 standalone submission
`fb78cb6e-f568-4119-838c-fe01077fac8e` was canceled on 2026-11-10, and App Store
Connect showed **Removed**. This did not withdraw the approved 1.6.0 app.
