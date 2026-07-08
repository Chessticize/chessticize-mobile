# iOS Device Targets

Chessticize Mobile 1.0 ships for iPhone and iPad with adaptive portrait,
landscape, and iPad multitasking layouts.

## 1.0 Decision

- Device family: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)
- Orientation: iPhone portrait plus landscape; iPad portrait, upside-down
  portrait, and landscape
- Minimum iOS version: 15.1

## Rationale

The 1.0 design keeps the board as the primary surface while adapting the chrome
and control placement to the measured viewport. Compact portrait keeps the
bottom-tab, one-column phone flow. Compact landscape uses a fixed board lane and
scrollable control rail so the board is not pushed below the fold. Regular-width
iPad layouts use a side navigation rail and wider content surfaces, with review
and active-session controls beside the board where space allows.

`UIRequiresFullScreen` is intentionally absent so iPad can use Split View and
Stage Manager sizes. The app declares an iPhone orientation mask for portrait
and landscape and an iPad mask for all four interface orientations.

## Adaptive Orientation Coverage

The mobile UI design defines the adaptive target for compact iPhone landscape,
regular-width iPad, and iPad split-view widths. The current implementation covers:

- an adaptive shell derived from measured width, height, and safe-area insets;
- board sizing based on the available board slot rather than screen width only;
- compact landscape session layouts with a fixed board lane and scrollable
  control rail;
- regular-width iPad layouts with side navigation and two-pane or three-pane
  content where useful;
- component tests for explicit portrait, landscape, iPad, and split-view
  dimensions.

Before App Store submission, simulator screenshot QA should still cover active
sprint, Arrow Duel, Analysis Review, History, and Settings in landscape and iPad
layouts.

## Verification

Release readiness for this item is covered by:

- `apps/mobile/__tests__/iosDeviceTargets.test.js`, which asserts the iPhone and
  iPad target family, adaptive Info.plist orientation masks, iOS 15.1 deployment
  target, and this documented decision.
- `apps/mobile/__tests__/PracticePocScreen.test.tsx`, which renders the main app
  shell under compact iPhone SE-sized portrait, modern iPhone portrait, compact
  iPhone landscape, iPad portrait, iPad landscape, and split-width viewports.
- Simulator build checks on the smallest available iPhone simulator, the current
  flagship simulator, and a representative iPad simulator before App Store
  submission.

If the local Xcode install does not include an iPhone SE runtime, use the
smallest available iPhone simulator for native build verification and keep the
component test as the deterministic SE-sized layout check.
