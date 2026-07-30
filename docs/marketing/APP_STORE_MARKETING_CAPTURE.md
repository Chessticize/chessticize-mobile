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
host UI before opening the exact iPad window. If that UI becomes windowless
without exiting, the wrapper verifies the executable path and terminates only
that host process. It does not shut down or erase either simulated device.

Different names may be supplied with
`CHESSTICIZE_MARKETING_IPHONE_DEVICE` and
`CHESSTICIZE_MARKETING_IPAD_DEVICE`. When a name is not unique, also supply its
UDID with `CHESSTICIZE_MARKETING_IPHONE_DEVICE_UDID` or
`CHESSTICIZE_MARKETING_IPAD_DEVICE_UDID`.

On a clean Mac, first discover the device profiles and installed runtimes:

```sh
xcrun simctl list devicetypes
xcrun simctl list runtimes
xcrun simctl list devices available
```

If the two default names do not already exist, create dedicated devices in
Xcode's **Window > Devices and Simulators** using an available 6.9-inch iPhone
17 Pro Max profile and 13-inch iPad Pro (M5) profile, then give them the exact
default names above. The equivalent `xcrun simctl create` command may be used
with the device-type and runtime identifiers printed by the first two commands;
do not copy identifiers from another Mac because installed runtimes can differ.
When equivalent profiles have different names, use the documented environment
variable overrides instead.

The host-side iPad rotation uses System Events to control the exact Simulator
window. Grant the terminal or automation host running this command permission
under **System Settings > Privacy & Security > Accessibility** and, when macOS
prompts, **Automation > System Events**. Confirm the Accessibility gate before
the release capture:

```sh
osascript -e 'tell application "System Events" to UI elements enabled'
```

It must print `true`. These are host permissions only; they are never committed
or copied from the preparation Mac.

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

The wrapper waits up to 60 seconds by default for the exact Simulator window
to become available on a clean machine. Set
`CHESSTICIZE_SIMULATOR_WINDOW_WAIT_ATTEMPTS` only when a slower host needs more
quarter-second attempts; the value must be a positive integer.

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

## Composition handoff

After the finalizer succeeds, use the reusable
[App Store marketing composition workflow](APP_STORE_MARKETING_COMPOSITION.md)
to validate the handoff again, generate the iPhone portrait and iPad landscape
contact sheets, and export the twelve Photo Studio A App Store PNGs. Keep the
raw capture directory immutable; write composed assets to the separate ignored
`scratch/store-assets/marketing-composed/<full-source-commit>/` directory.

The launch profile freezes the approved clock and imports the deterministic
fixture through the normal persistent mobile practice service backed by the
app's writable SQLite path. Detox deletes the dedicated simulator app sandbox
before every frame, so fixture state cannot leak between frames or into a
normal first run. The profile does not enable developer controls, persist the
active Sprint snapshots, or navigate to or render Tactical Profile,
Tactical Progress, inferred weaknesses, or model recommendations. The separate
release-QA capture remains unchanged.

## CI and release integration

This dual-device workflow remains an explicit local pre-submission task rather
than a hosted CI job. It depends on named 6.9-inch and 13-inch simulators, exact
host-window rotation for iPad, and produces large ignored PNG artifacts that
are consumed only when preparing an App Store version. The focused fixture,
artifact, story-contract, typecheck, and lint tests remain suitable for normal
PR CI. Run the full capture at the exact source commit selected for the next
App Store submission; a non-blocking hosted capture job is intentionally not
added at this stage.
