---
name: chessticize-app-store-marketing
description: Compose Chessticize's approved deterministic raw mobile captures into App Store Photo Studio A or Google Play Screen First PNGs. Use when preparing, previewing, validating, or regenerating the six-frame English store sequence from a verified capture manifest.
---

# Chessticize App Store Marketing

## Overview

Turn a verified raw-capture handoff into deterministic, receipt-backed store
screenshots without changing the captured product state. The default
composition remains the approved App Store Photo Studio A direction: warm
white and icy-blue chessboard scenes, frame-specific frosted chess pieces,
realistic Imagegen device photography, and the real app UI as the primary
proof. The separate Google Play Screen First layout reuses the same engine and
six-frame story with Android-native phone, 7-inch tablet, and 10-inch tablet
captures. The previous Cobalt Focus layout remains available only as an
explicit App Store v1 fallback.

## Workflow

1. Locate the exact raw capture directory. Require its `manifest.json`, all six
   iPhone portrait PNGs, and all six native iPad landscape PNGs.
2. Run preview-only composition first:

   ```sh
   pnpm app-store:compose-marketing -- \
     --capture-root scratch/store-assets/marketing/<source-commit> \
     --output-dir scratch/store-assets/marketing-composed/<source-commit> \
     --platform app-store \
     --device-family all \
     --orientation all \
     --preview-only
   ```

3. Inspect both overview sheets and `preview-iphone-corners.png`. Confirm every
   headline is legible, every product screen remains the main proof, all four
   iPhone corners follow the photographed bezel without leaking or clipping,
   and the iPad set retains the real landscape hierarchy.
4. Generate the upload-sized files after review:

   ```sh
   pnpm app-store:compose-marketing -- \
     --capture-root scratch/store-assets/marketing/<source-commit> \
     --output-dir scratch/store-assets/marketing-composed/<source-commit> \
     --platform app-store \
     --device-family all \
     --orientation all
   ```

5. Treat `composition-manifest.json` as the export receipt. It records the
   source manifest hash, source commit, layout ID, output dimensions, source
   hashes, renderer versions, all twelve background-template hashes, final
   hashes, detected device geometry, exact-mask strategy, device consistency,
   and review-sheet hashes.

Use `--device-family iphone` or `--device-family ipad` only for a focused
preview. `--platform` and `--orientation` select config-defined presets rather
than changing renderer code. Use `--manifest` for a non-default handoff path
and `--layout-config` only for an intentionally reviewed layout revision.

## Google Play Workflow

For an exact listing handoff, install the accepted build through Google Play on
each authorized capture device. Do not side-load the public APK mirror. For
every public-UI frame, run
`pnpm mobile:capture:marketing-public-ui-frame:android`
with the exact artifact/mirror/source environment and the canonical
`CHESSTICIZE_MARKETING_CAPTURE_ID`. Require its PNG and `.capture.json`
sidecar. The family recorder re-inspects the live Play-installed session and
rejects device, installer, package, version, signer, production-flag,
foreground-app, screenshot, or sidecar drift.

Use the issue #444 Android capture handoff only after its manifest identifies
all three device families, exact source commit, exact candidate, and installed
Play sessions. Preview all families:

```sh
pnpm google-play:compose-marketing -- \
  --capture-root scratch/store-assets/google-play/<source-commit> \
  --manifest scratch/store-assets/google-play/<source-commit>/google-play-capture-manifest.json \
  --output-dir scratch/store-assets/google-play-composed/<source-commit> \
  --device-family all \
  --orientation all \
  --preview-only
```

Inspect the three contact sheets, then omit `--preview-only` for the final
eighteen-image export. The Play layout normalizes its verified raw inputs to:

- phone portrait: 1080 x 1920, with the canonical headline confined to the top
  20 percent;
- 7-inch tablet portrait: 1440 x 2560, with no marketing-text overlay; and
- 10-inch tablet landscape: 2560 x 1440, with no marketing-text overlay.

All three presets are frameless and UI-dominant. They do not draw or retain
device imagery. The tablet outputs follow Google's preferred 9:16 portrait or
16:9 landscape ratios and provide six screenshots, exceeding the four-image
large-screen recommendation. Every final PNG is 24-bit opaque output.

The canonical screenshot alt text is owned by
`config/google-play-metadata-en-us-v1.json`, not the layout. Composition loads
that contract, checks frame IDs, headlines, order, locale, and the 140-character
limit, then records the metadata hash and per-artifact alt text in
`composition-manifest.json`. The same receipt retains the capture status and
APK/AAB/source/mirror identity supplied by an exact-artifact handoff; a preview
handoff cannot claim that production identity.

After the full eighteen-image export, use
`google-play:listing:prepare-review`, `google-play:listing:handoff`, and
`google-play:listing:verify` as documented in
`docs/ANDROID_PLAY_LISTING.md`. The final asset-set digest binds the locale
metadata, icon, feature graphic, exact capture and composition manifests,
eighteen final PNG hashes and alt text, and owner-reviewed Console receipt.

## Refreshing a Scene Template

The twelve versioned PNGs under `assets/` are deterministic compositor inputs,
not generated during export. Use OpenAI Imagegen only when intentionally
creating a new visual revision:

1. Select exactly one frame and one device family. Use its paired scene as an
   art-direction reference, but compose natively for the target orientation.
2. Preserve the approved headline, warm-white and icy-blue studio, perspective
   board, frosted chess prop, realistic physical device, and unobstructed
   screen opening. Generated screen content is disposable and must never remain
   visible in the exported product proof.
3. Keep the iPhone device size within the configured family tolerance. Keep all
   iPad scene templates on the verified true-4:3 device geometry.
4. Replace the exact versioned asset, then update its dimensions and SHA-256 in
   `assets/app-store-marketing-layout-v2.json`. Change the layout ID when the
   approved visual system changes materially.
5. Run the focused tests and regenerate both overview sheets plus the iPhone
   corner audit before accepting the new scene.

## Invariants

- Do not edit, overwrite, resize in place, or write inside the raw capture
  directory.
- Do not substitute an iPhone image for iPad. The iPad source must identify
  itself as 13-inch native landscape and use an accepted landscape pixel size.
- Do not retouch or regenerate the final app UI. The compositor uniformly
  scales the immutable raw capture into the detected opening and clips it with
  the exact bezel-derived mask. It may not crop away disclosures, cover the
  board, invent product state, or retain generated placeholder UI.
- Every frame and device family has its own immutable, hash-bound scene. iPad
  may reuse the approved physical-device geometry, but it retains a separately
  reviewed frame-specific background.
- Keep the approved six-frame order and English copy from the capture manifest.
  The selected direction intentionally uses the final headline without a
  secondary marketing paragraph.
- For Google Play, keep phone headline coverage at or below 20 percent. Do not
  add extra marketing text to 7-inch or 10-inch tablet screenshots, and do not
  draw device frames around any Android capture.
- Keep Google Play screenshot alt text identical to the canonical metadata
  contract. Do not fork alt text into the layout.
- Keep the scene headline identical to the canonical contract. A copy change
  requires a new reviewed scene hash; do not edit text during export.
- Treat the layout's six canonical frame records as authoritative for order,
  IDs, English copy, and output filenames. Do not accept a self-consistent
  capture manifest that changes those values.
- Detect the actual dark headline pixels and photographic device bounds in
  every frozen scene, then reject either one outside its configured safe area.
- Reject a screen opening with the wrong source aspect, an implausible mask
  area, or device-size drift beyond the configured family tolerance.
- Keep generated PNGs and contact sheets under ignored `scratch/` paths unless
  a human explicitly selects sanitized final assets for publication.
- Export every final App Store PNG without an alpha channel. A visually opaque
  image that still carries PNG transparency metadata is not upload-ready.
- Export every final Google Play screenshot as a 24-bit PNG without an alpha
  channel.
- Before App Store upload, recheck Apple's current accepted dimensions and run
  the release asset audit required by issue #417.

## Failure Behavior

The command composes and validates the complete selected family in memory
before creating or changing the output directory. It
fails on a story or locale mismatch, missing or duplicate frames, wrong order,
canonical copy or filename drift, wrong device/orientation/display group,
unsupported dimensions, changed SHA-256, missing raw or scene PNG, a missing
frame-specific scene, headline or device safe-area overflow, wrong screen
aspect, invalid closed-bezel mask, inconsistent device size, path traversal,
escaping symlinks, unsafe output names, or an output directory inside the raw
handoff. Google Play also fails on device imagery, tablet marketing text,
non-frameless presentation, an overlay above 20 percent, non-9:16/16:9 tablet
output, out-of-policy pixel dimensions, or canonical alt-text drift.

Do not bypass a failure. Regenerate or correct the issue #411 App Store or
issue #444 Google Play handoff, then run the compositor again.

## Implementation

- Layout contract:
  `assets/app-store-marketing-layout-v2.json`
- Google Play layout contract:
  `assets/google-play-marketing-layout-v1.json`
- Twelve frame-specific Imagegen scene templates:
  `assets/photo-studio-frame-*.png`
- Retained fallback:
  `assets/app-store-marketing-layout-v1.json` and
  `assets/cobalt-focus-frame-*.png`
- Deterministic Sharp compositor:
  `scripts/compose-marketing-assets.mjs`
- Focused contract and reproducibility tests:
  `scripts/app-store-marketing-composition.test.mjs` and
  `scripts/google-play-marketing-composition.test.mjs` at the repository root
