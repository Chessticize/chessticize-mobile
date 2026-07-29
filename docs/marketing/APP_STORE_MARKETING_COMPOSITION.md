# App Store Marketing Composition

This workflow turns the deterministic raw screenshots from
[`APP_STORE_MARKETING_CAPTURE.md`](APP_STORE_MARKETING_CAPTURE.md) into the
twelve polished English App Store assets defined by
[`APP_STORE_SCREENSHOT_STORY.md`](APP_STORE_SCREENSHOT_STORY.md).

It is separate from the maintained fifteen-scene release-QA screenshot set in
[`docs/STORE_ASSETS.md`](../STORE_ASSETS.md). Marketing composition does not
replace native visual-regression evidence.

## Approved direction

The default version 2 layout is **Photo Studio A**:

- a calm warm-white and icy-blue premium studio;
- a visible perspective chessboard and frame-specific frosted chess pieces;
- one large dark benefit headline;
- realistic Imagegen device photography; and
- the actual captured app UI as the dominant product proof.

Every frame and device family has a separately reviewed, hash-bound scene
template. iPhone uses six individually generated portrait device scenes. iPad
uses six landscape backgrounds with one verified true-4:3 photographic iPad
geometry so the hardware size and screen opening remain consistent across the
set.

| Frame | Benefit | Studio prop |
| --- | --- | --- |
| 1 | Build Tactical Intuition | Frosted bishop and a quiet opening board. |
| 2 | Choose the Best Move | Frosted knight beside the decision frame. |
| 3 | Focus Your Practice | Frosted bishop beside the deliberate setup. |
| 4 | Make Every Mistake Count | Frosted rook reinforces recurrence and return. |
| 5 | See Your Progress | Frosted major pieces mark measured progress. |
| 6 | Private. Offline. Open Source. | A calm frosted piece supports the trust frame. |

Imagegen supplies the studio, headline, props, and physical-device photography.
It does not supply the final product UI. During export, the compositor detects
the closed dark bezel, derives the screen opening, and replaces the entire
opening with the immutable raw capture. The iPhone opening uses a per-template
flood-filled pixel mask instead of one generic rounded rectangle, so all four
corners follow that photographed device exactly. A generated placeholder
interface is never retained inside the final screen.

The direction intentionally omits the longer supporting paragraph from the
visual layout. Final supporting copy remains part of the canonical story
contract and App Store metadata inputs; it is not silently rewritten by the
compositor.

The layout has separate presets for a 6.9-inch iPhone in portrait and a
13-inch iPad in landscape. The iPad template always consumes the real native
landscape capture. It does not rotate, stretch, or embed a portrait interface.

The previous **Cobalt Focus** version 1 layout remains available as a reviewed
fallback by passing:

```sh
--layout-config .codex/skills/chessticize-app-store-marketing/assets/app-store-marketing-layout-v1.json
```

## Generate a review preview

Use the full source commit recorded by the raw handoff:

```sh
pnpm app-store:compose-marketing -- \
  --capture-root scratch/store-assets/marketing/<source-commit> \
  --output-dir scratch/store-assets/marketing-composed/<source-commit> \
  --platform app-store \
  --device-family all \
  --orientation all \
  --preview-only
```

This writes:

```text
scratch/store-assets/marketing-composed/<source-commit>/
  preview-iphone-contact-sheet.png
  preview-ipad-contact-sheet.png
  preview-iphone-corners.png
  composition-manifest.json
```

Preview-only mode performs the same complete source validation and composition
work as a full export but does not write the twelve individual final PNGs.

## Export the complete set

After the contact sheets are approved, omit `--preview-only`:

```sh
pnpm app-store:compose-marketing -- \
  --capture-root scratch/store-assets/marketing/<source-commit> \
  --output-dir scratch/store-assets/marketing-composed/<source-commit> \
  --platform app-store \
  --device-family all \
  --orientation all
```

The output keeps the raw handoff's stable filenames under device-specific
directories:

```text
scratch/store-assets/marketing-composed/<source-commit>/
  iphone-6.9-inch-portrait/
    marketing-01-standard-sprint.png
    ...
    marketing-06-trust.png
  ipad-13-inch-landscape/
    marketing-01-standard-sprint.png
    ...
    marketing-06-trust.png
  preview-iphone-contact-sheet.png
  preview-ipad-contact-sheet.png
  preview-iphone-corners.png
  composition-manifest.json
```

The final PNG dimensions exactly match each accepted raw source dimension.
The compositor uniformly scales the raw UI into the detected screen opening
and clips it with the exact bezel-derived silhouette. It does not retouch or
generate pixels inside the app screen.

## Validation and reproducibility

Before writing an output, the command validates:

- story ID and locale;
- six canonical frame records covering order, IDs, English headline and
  supporting copy, and exact output filenames;
- platform, device-family, and orientation selection against config-defined
  presets;
- device family, display group, orientation, and accepted pixel dimensions;
- the recorded PNG dimensions and SHA-256 for every selected source;
- the frame ID, dimensions, orientation, and SHA-256 of all twelve frozen
  Imagegen scene templates;
- the actual headline-pixel and photographic-device bounds against their
  configured title and product safe areas;
- screen-opening aspect compatibility with the raw device capture;
- closed-bezel mask area and per-family device-size consistency;
- relative PNG paths, symlink containment, and stable output filenames; and
- separation between the immutable raw handoff and composed output.

All selected frames and review sheets are composed and validated in memory
before the output directory is created or changed. A late mask, safe-area, or
device-consistency failure therefore cannot leave a partial final set.

Photo Studio A's reviewed headlines are part of the frozen scene templates.
The canonical text remains in the story contract, and any copy change requires
regenerating and reviewing the affected template plus updating its SHA-256.
The retained Cobalt Focus fallback continues to rasterize canonical copy with
the renderer's guaranteed generic `sans-serif` family and fails on safe-area
overflow.

The export receipt records the layout ID, capture-manifest SHA-256, source
commit, renderer versions, scene provenance and hashes, source and final image
hashes, detected device geometry, exact-mask strategy, device-size consistency,
dimensions, and contact-sheet hashes. Imagegen is not called during export.
There are no timestamps or random export inputs, so identical raw captures,
frozen scenes, code, config, and renderer runtime produce identical output
bytes.

Platform, family, and orientation are data-selected from the layout config.
The v2 contract supplies App Store iPhone and iPad presets; a future store
target can use a separate reviewed layout config without changing compositor
selection logic.

To change one scene, use Imagegen to edit that exact frame and orientation,
replace its versioned PNG, and update the corresponding dimensions and SHA-256
in the layout contract. Review both full contact sheets and the iPhone corner
audit. Keep the full screen opening available for deterministic raw capture
replacement; never accept visible generated UI as final product evidence.

The reusable workflow lives in
`.codex/skills/chessticize-app-store-marketing/`. Run its focused tests with:

```sh
node --test scripts/app-store-marketing-composition.test.mjs
```

Generated final screenshots remain under ignored `scratch/` paths. The twelve
sanitized scene templates are versioned skill inputs; raw captures and composed
App Store screenshots are not committed unless explicitly selected for
publication.
