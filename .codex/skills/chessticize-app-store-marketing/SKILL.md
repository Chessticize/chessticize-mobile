---
name: chessticize-app-store-marketing
description: Compose Chessticize's approved deterministic raw iPhone portrait and native iPad landscape captures into App Store-ready Photo Studio A PNGs. Use when preparing, previewing, validating, or regenerating the six-frame English App Store marketing sequence from an issue #411 capture manifest.
---

# Chessticize App Store Marketing

## Overview

Turn a verified raw-capture handoff into twelve polished screenshots, two
overview sheets, and one iPhone corner-audit sheet without changing the
captured product state. The default composition is the approved Photo Studio A
direction: warm white and icy-blue chessboard scenes, frame-specific frosted
chess pieces, realistic Imagegen device photography, and the real app UI as
the primary proof. The previous Cobalt Focus layout remains available only as
an explicit v1 fallback.

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
- Keep the scene headline identical to the canonical contract. A copy change
  requires a new reviewed scene hash; do not edit text during export.
- Reject a screen opening with the wrong source aspect, an implausible mask
  area, or device-size drift beyond the configured family tolerance.
- Keep generated PNGs and contact sheets under ignored `scratch/` paths unless
  a human explicitly selects sanitized final assets for publication.
- Before App Store upload, recheck Apple's current accepted dimensions and run
  the release asset audit required by issue #417.

## Failure Behavior

The command validates the complete selected family before writing outputs. It
fails on a story or locale mismatch, missing or duplicate frames, wrong order,
wrong device/orientation/display group, unsupported dimensions, changed
SHA-256, missing raw or scene PNG, a missing frame-specific scene, wrong screen
aspect, invalid closed-bezel mask, inconsistent device size, path traversal,
escaping symlinks, unsafe output names, or an output directory inside the raw
handoff.

Do not bypass a failure. Regenerate or correct the issue #411 handoff, then run
the compositor again.

## Implementation

- Layout contract:
  `assets/app-store-marketing-layout-v2.json`
- Twelve frame-specific Imagegen scene templates:
  `assets/photo-studio-frame-*.png`
- Retained fallback:
  `assets/app-store-marketing-layout-v1.json` and
  `assets/cobalt-focus-frame-*.png`
- Deterministic Sharp compositor:
  `scripts/compose-marketing-assets.mjs`
- Focused contract and reproducibility tests:
  `scripts/app-store-marketing-composition.test.mjs` at the repository root
