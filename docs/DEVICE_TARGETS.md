# Mobile Device Targets

## Android Launch Baseline

The permanent Android application ID, namespace, and Kotlin package are
`com.chessticize.mobile`. The supported platform envelope is minimum API 24
with compile and target API 36. Universal Android packages contain only
`arm64-v8a` and `x86_64` native libraries.

The manually dispatched Android diagnostic workflow builds one self-contained
E2E APK, verifies its native ABI contents, and can run the complete shared
`flows` and `practice` suites on an API 36 x86_64 phone emulator. The same
manual workflow reuses that build for the bounded API 24
launch/storage/practice/native-engine smoke and representative API 36 tablet
and foldable/resizable evidence. It has no scheduled trigger and is not a
recurring release gate; select it only under `docs/ANDROID_VALIDATION.md`.
Production release packaging requires explicit release signing material and
has no debug keystore fallback.

## iOS Device Targets

Chessticize Mobile 1.3 keeps full-screen iPhone use in portrait
while preserving adaptive wide-window layouts and iPad portrait, landscape, and
multitasking.

## Current Decision

- Device family: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)
- Orientation: full-screen iPhone portrait only; iPad portrait, upside-down
  portrait, and landscape
- Minimum iOS version: 15.1

## Rationale

The current design keeps the board as the primary surface while adapting the
chrome and control placement to the measured viewport. Full-screen iPhone use
stays in the one-handed portrait flow instead of rotating into a mode that is
rarely used and carries a disproportionate native QA cost. This orientation
choice applies to physical full-screen phone rotation; it does not make every
iPhone scene portrait-shaped.

`UIRequiresFullScreen` is intentionally absent so iPad can use Split View and
Stage Manager sizes. The app declares a portrait-only iPhone orientation mask
and an iPad mask for all four interface orientations. Apple treats supported
orientations as preferences in resizable iOS 27 environments, so layout must
continue to follow the actual scene size rather than the device idiom or
orientation mask. See
[Modernize your UIKit app](https://developer.apple.com/videos/play/wwdc2026/278/).

## Adaptive Window Coverage

The mobile UI design defines the adaptive target for compact portrait phones,
compact wide-short and foldable-sized windows, regular-width iPad portrait,
iPad landscape, and iPad split-view widths. The current implementation covers:

- an adaptive shell derived from measured width, height, and safe-area insets;
- board sizing based on the available board slot rather than screen width only;
- compact wide-short and split-view session layouts with a fixed board lane and
  scrollable control rail, even though ordinary full-screen iPhones no longer
  rotate into them;
- regular-width iPad portrait sessions with a larger vertical board flow;
- regular-width iPad landscape layouts with side navigation and two-pane or
  three-pane content where useful;
- component tests for explicit portrait, wide-short, foldable-sized, iPad, and
  split-view dimensions.

Before App Store submission, native simulator QA covers iPhone portrait plus
iPad portrait and landscape. Component and Interaction Lab QA cover compact
wide-short, live-resize, and foldable-sized windows. Active Sprint, Arrow Duel,
Analysis Review, History, and Settings remain represented across that matrix.

## Verification

Release readiness for this item is covered by:

- `apps/mobile/__tests__/iosDeviceTargets.test.js`, which asserts the iPhone and
  iPad target family, portrait-only iPhone and all-orientation iPad Info.plist
  masks, iOS 15.1 deployment target, and this documented decision.
- `apps/mobile/__tests__/adaptivePracticeLayout.test.tsx`, which retains compact
  wide-short, iPad landscape, and unfolded foldable-sized layout contracts.
- `apps/mobile/__tests__/PracticePocScreen.test.tsx`, which renders the main app
  shell under compact iPhone SE-sized portrait, modern iPhone portrait, compact
  wide-short, iPad portrait, iPad landscape, and split-width viewports.
- Simulator build checks on the smallest available iPhone simulator, the current
  flagship simulator, and a representative iPad simulator before App Store
  submission.

If the local Xcode install does not include an iPhone SE runtime, use the
smallest available iPhone simulator for native build verification and keep the
component test as the deterministic SE-sized layout check.
