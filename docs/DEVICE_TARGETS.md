# iOS Device Targets

Chessticize Mobile 1.0 ships as a full-screen portrait app for iPhone and iPad.

## 1.0 Decision

- Device family: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)
- Orientation: full-screen portrait only (`UIRequiresFullScreen` and `UIInterfaceOrientationPortrait`)
- Minimum iOS version: 15.1

## Rationale

The 1.0 design is optimized for portrait use. Practice and review flows keep the
board as the primary surface, with timer, prompts, candidate controls, and
review actions arranged for the tested phone viewport while scaling up to iPad
in full-screen portrait.

Landscape and multitasking layouts remain out of scope for 1.0. `UIRequiresFullScreen`
keeps the iPad target on the same portrait surface until a dedicated tablet
layout pass, landscape behavior, and App Store screenshot and QA coverage are
added.

## Future Adaptive Orientation Target

The mobile UI design now defines a follow-up adaptive target for compact
iPhone landscape, regular-width iPad, and iPad split-view widths. That target
does not change the 1.0 release configuration by itself. Before removing the
portrait-only orientation lock, the app needs:

- an adaptive shell derived from measured width, height, and safe-area insets;
- board sizing based on the available board slot rather than screen width only;
- compact landscape session layouts with a fixed board lane and scrollable
  control rail;
- regular-width iPad layouts with side navigation and two-pane or three-pane
  content where useful;
- component tests for explicit portrait, landscape, and split-view dimensions;
- simulator screenshot QA for active sprint, Arrow Duel, Analysis Review,
  History, and Settings in landscape and iPad layouts.

## Verification

Release readiness for this item is covered by:

- `apps/mobile/__tests__/iosDeviceTargets.test.js`, which asserts the iPhone and
  iPad target family, full-screen portrait Info.plist orientation, iOS 15.1
  deployment target, and this documented decision.
- `apps/mobile/__tests__/PracticePocScreen.test.tsx`, which renders the main app
  shell under compact iPhone SE-sized and modern iPhone-sized portrait
  viewports.
- Simulator build checks on the smallest available iPhone simulator, the current
  flagship simulator, and a representative iPad simulator before App Store
  submission.

If the local Xcode install does not include an iPhone SE runtime, use the
smallest available iPhone simulator for native build verification and keep the
component test as the deterministic SE-sized layout check.
