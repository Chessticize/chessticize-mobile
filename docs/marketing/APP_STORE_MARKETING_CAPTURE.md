# App Store Marketing Capture

This workflow produces the twelve deterministic, full-resolution product
screenshots required by the approved
[App Store screenshot story](APP_STORE_SCREENSHOT_STORY.md). It is separate
from the maintained fifteen-scene release-QA workflow in
[`docs/STORE_ASSETS.md`](../STORE_ASSETS.md).

## Capture targets

The workflow requires two dedicated, available iOS Simulators:

- `Chessticize Marketing iPhone 17 Pro Max`, used in portrait
- `Chessticize Marketing iPad Pro 13-inch (M5)`, used in landscape

Keep the Mac unlocked during capture. Detox keeps the iPhone capture in
portrait. For iPad, the wrapper opens the exact Simulator window and uses the
host Rotate control because current iPadOS windowing can reject an in-app
orientation request. It verifies the framebuffer before starting the iPad
capture and restores that Simulator to portrait when the command finishes or
fails. After the iPhone capture, the wrapper restarts only the Mac Simulator
host UI before opening the exact iPad window; it does not shut down or erase
either simulated device.

Different names may be supplied with
`CHESSTICIZE_MARKETING_IPHONE_DEVICE` and
`CHESSTICIZE_MARKETING_IPAD_DEVICE`. When a name is not unique, also supply its
UDID with `CHESSTICIZE_MARKETING_IPHONE_DEVICE_UDID` or
`CHESSTICIZE_MARKETING_IPAD_DEVICE_UDID`.

The iPhone profile must belong to the 6.9-inch App Store display group. The
iPad profile must be 13-inch. The capture rejects a wrong profile,
orientation, or pixel size. Accepted raw sizes are:

- iPhone portrait: `1260 x 2736`, `1290 x 2796`, or `1320 x 2868`
- iPad landscape: `2752 x 2064` or `2732 x 2048`

Recheck the
[live Apple screenshot specification](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
before App Store upload.

## Run the complete capture

Commit the intended source first, keep the tracked worktree clean, then run:

```sh
pnpm mobile:capture:marketing-assets:ios
```

The command performs iOS preflight, builds the Release simulator app once,
captures all six frames on the iPhone in portrait, captures the same six
frames on the iPad in its real responsive landscape layout, and verifies one
combined manifest. It does not require manual tapping.

By default, output is written below:

```text
scratch/store-assets/marketing/<full-source-commit>/
```

Override this with `CHESSTICIZE_MARKETING_OUTPUT_ROOT`. The generated
directory is ignored by Git.

## Artifact contract

Each run contains:

- six raw iPhone PNGs under `iphone-6.9-inch-portrait/`;
- six raw iPad PNGs under `ipad-13-inch-landscape/`;
- `manifest-iphone.json` and `manifest-ipad.json`;
- `manifest.json`, the verified twelve-image handoff for composition issue
  #412; and
- Detox diagnostics for each device family.

The finalizer fails unless both device sets:

- use the approved six-frame order and final copy keys;
- come from the same full source commit and fictional-user contract;
- use the required native orientation and exact App Store pixel dimensions;
- retain the expected source screen, locale, and bundled puzzle-pack identity;
  and
- still match every PNG's recorded dimensions and SHA-256.

The launch profile freezes the approved clock and loads a maintained in-memory
practice service. It does not enable developer controls, persist the active
Sprint snapshots, or add Tactical Profile data. The separate release-QA
capture remains unchanged.
