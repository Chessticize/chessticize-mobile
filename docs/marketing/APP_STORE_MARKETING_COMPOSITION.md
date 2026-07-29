# App Store Marketing Composition

This workflow turns the deterministic raw screenshots from
[`APP_STORE_MARKETING_CAPTURE.md`](APP_STORE_MARKETING_CAPTURE.md) into the
twelve polished English App Store assets defined by
[`APP_STORE_SCREENSHOT_STORY.md`](APP_STORE_SCREENSHOT_STORY.md).

It is separate from the maintained fifteen-scene release-QA screenshot set in
[`docs/STORE_ASSETS.md`](../STORE_ASSETS.md). Marketing composition does not
replace native visual-regression evidence.

## Approved direction

The version 1 layout is **Cobalt Focus**:

- the clear, product-first hierarchy from the Quiet Focus concept;
- twelve vivid cobalt Imagegen background boards, one per frame and device
  family;
- one large white benefit headline;
- a simple dark device boundary; and
- the actual captured app UI as the dominant proof.

The six background motifs create a coherent sequence without repeating one
generic template:

| Frame | Benefit | Abstract background motif |
| --- | --- | --- |
| 1 | Build Tactical Intuition | Scattered signals resolve into connected patterns. |
| 2 | Choose the Best Move | Two candidate paths diverge; one remains clear. |
| 3 | Focus Your Practice | Layered possibilities converge on a deliberate focus window. |
| 4 | Make Every Mistake Count | Review recurrence appears as timing rings and a returning trajectory. |
| 5 | See Your Progress | A non-linear rising ribbon passes measured milestones. |
| 6 | Private. Offline. Open Source. | A calm local light core sits inside open, inspectable layers. |

Every motif has a separately generated iPhone portrait and iPad landscape
board. Imagegen supplies atmospheric background art only. It never creates or
alters the product UI, device boundary, headline, user state, or factual claim.

The direction intentionally omits the longer supporting paragraph from the
visual layout. Final supporting copy remains part of the canonical story
contract and App Store metadata inputs; it is not silently rewritten by the
compositor.

The layout has separate presets for a 6.9-inch iPhone in portrait and a
13-inch iPad in landscape. The iPad template always consumes the real native
landscape capture. It does not rotate, stretch, or embed a portrait interface.

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
  composition-manifest.json
```

The final PNG dimensions exactly match each accepted raw source dimension.
The compositor uniformly scales the raw UI within the device boundary; it
does not crop, retouch, or generate pixels inside the app screen.

## Validation and reproducibility

Before writing an output, the command validates:

- story ID, locale, six-frame order, IDs, and copy keys;
- platform, device-family, and orientation selection against config-defined
  presets;
- device family, display group, orientation, and accepted pixel dimensions;
- the recorded PNG dimensions and SHA-256 for every selected source;
- the frame ID, dimensions, orientation, and SHA-256 of all twelve frozen
  Imagegen background boards;
- relative PNG paths, symlink containment, and stable output filenames; and
- separation between the immutable raw handoff and composed output.

The typography contract uses the renderer's guaranteed generic `sans-serif`
family instead of silently substituting an unavailable named font. Each
headline is rasterized before export and its actual non-transparent pixel
bounds must remain inside the configured safe area. A copy or layout update
that overflows fails before final screenshots are written.

The export receipt records the layout ID, capture-manifest SHA-256, source
commit, renderer and font-library versions, background provenance and hashes,
source and final image hashes, dimensions, and contact-sheet hashes. Imagegen
is not called during export. There are no timestamps or random export inputs,
so identical raw captures, frozen boards, code, config, and renderer runtime
produce identical output bytes. A different pinned renderer can remain
predictably equivalent while its receipt makes that environment difference
explicit.

Platform, family, and orientation are data-selected from the layout config.
The v1 contract supplies App Store iPhone and iPad presets; a future store
target can use a separate reviewed layout config without changing compositor
selection logic.

To change one board, use Imagegen to create background-only art for that exact
frame and orientation, replace its versioned PNG, and update the corresponding
dimensions and SHA-256 in the layout contract. Review both full contact sheets;
do not update one device family by mechanically cropping the other.

The reusable workflow lives in
`.codex/skills/chessticize-app-store-marketing/`. Run its focused tests with:

```sh
node --test scripts/app-store-marketing-composition.test.mjs
```

Generated final screenshots remain under ignored `scratch/` paths. The twelve
sanitized background-only boards are versioned skill inputs; raw captures and
composed App Store screenshots are not committed unless explicitly selected
for publication.
