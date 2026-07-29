---
name: chessticize-app-store-marketing
description: Compose Chessticize's approved deterministic raw iPhone portrait and native iPad landscape captures into App Store-ready Cobalt Focus PNGs. Use when preparing, previewing, validating, or regenerating the six-frame English App Store marketing sequence from an issue #411 capture manifest.
---

# Chessticize App Store Marketing

## Overview

Turn a verified raw-capture handoff into twelve polished screenshots and two
contact sheets without changing the captured product state. The composition is
the approved Quiet Focus hierarchy on six frame-specific Cobalt Focus
background boards: one white headline, the real app UI as the primary proof,
and paired Imagegen art composed natively for iPhone portrait and iPad
landscape.

## Workflow

1. Locate the exact raw capture directory. Require its `manifest.json`, all six
   iPhone portrait PNGs, and all six native iPad landscape PNGs.
2. Run preview-only composition first:

   ```sh
   pnpm app-store:compose-marketing -- \
     --capture-root scratch/store-assets/marketing/<source-commit> \
     --output-dir scratch/store-assets/marketing-composed/<source-commit> \
     --preview-only
   ```

3. Inspect both contact sheets. Confirm every headline is legible, every
   product screen remains the main proof, no device frame covers meaningful UI,
   and the iPad set retains the real landscape hierarchy.
4. Generate the upload-sized files after review:

   ```sh
   pnpm app-store:compose-marketing -- \
     --capture-root scratch/store-assets/marketing/<source-commit> \
     --output-dir scratch/store-assets/marketing-composed/<source-commit>
   ```

5. Treat `composition-manifest.json` as the export receipt. It records the
   source manifest hash, source commit, layout ID, output dimensions, source
   hashes, all twelve background-template hashes, final hashes, and
   contact-sheet hashes.

Use `--device-family iphone` or `--device-family ipad` only for a focused
preview. Use `--manifest` for a non-default handoff path and `--layout-config`
only for an intentionally reviewed layout revision.

## Refreshing a Background Board

The twelve versioned PNGs under `assets/` are deterministic compositor inputs,
not generated during export. Use OpenAI Imagegen only when intentionally
creating a new visual revision:

1. Select exactly one frame and one device family. Use the paired board as an
   art-direction reference, but compose natively for the target orientation.
2. Generate background only: no headline, label, logo, device, screenshot,
   interface, chess piece, personal data, or text-like marks.
3. Preserve the calm upper headline zone and quiet central product zone. Put
   the frame-specific motif mainly in the margins where it remains visible
   around the real app capture.
4. Replace the exact versioned asset, then update its dimensions and SHA-256 in
   `assets/app-store-marketing-layout-v1.json`. Change the layout ID when the
   approved visual system changes materially.
5. Run the focused tests and regenerate both contact sheets before accepting
   the new board.

Keep the six semantic motifs distinct: pattern recognition, candidate choice,
manual focus, review recurrence, measured progress, and local/open trust.

## Invariants

- Do not edit, overwrite, resize in place, or write inside the raw capture
  directory.
- Do not substitute an iPhone image for iPad. The iPad source must identify
  itself as 13-inch native landscape and use an accepted landscape pixel size.
- Do not retouch or regenerate the app UI. The compositor may uniformly scale
  and round the source image, but it may not crop away disclosures, cover the
  board, invent product state, or change pixels inside the source screen.
- Imagegen owns only the abstract background boards. Every frame and device
  family has its own immutable, hash-bound board; never silently reuse one
  frame's board for another benefit.
- Keep the approved six-frame order and English copy from the capture manifest.
  The selected direction intentionally uses the final headline without a
  secondary marketing paragraph.
- Keep generated PNGs and contact sheets under ignored `scratch/` paths unless
  a human explicitly selects sanitized final assets for publication.
- Before App Store upload, recheck Apple's current accepted dimensions and run
  the release asset audit required by issue #417.

## Failure Behavior

The command validates the complete selected family before writing outputs. It
fails on a story or locale mismatch, missing or duplicate frames, wrong order,
wrong device/orientation/display group, unsupported dimensions, changed
SHA-256, missing raw or background PNG, a missing frame-specific background,
path traversal, escaping symlinks, unsafe output names, or an output directory
inside the raw handoff.

Do not bypass a failure. Regenerate or correct the issue #411 handoff, then run
the compositor again.

## Implementation

- Layout contract:
  `assets/app-store-marketing-layout-v1.json`
- Twelve frame-specific Imagegen background boards:
  `assets/cobalt-focus-frame-*.png`
- Deterministic Sharp compositor:
  `scripts/compose-marketing-assets.mjs`
- Focused contract and reproducibility tests:
  `scripts/app-store-marketing-composition.test.mjs` at the repository root
