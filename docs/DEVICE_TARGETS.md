# iOS Device Targets

Chessticize Mobile 1.0 ships as an iPhone-only app.

## 1.0 Decision

- Device family: iPhone only (`TARGETED_DEVICE_FAMILY = 1`)
- Orientation: portrait only (`UIInterfaceOrientationPortrait`)
- Minimum iOS version: 15.1

## Rationale

The 1.0 design is optimized for one-handed portrait use. Practice and review
flows keep the board as the primary surface, with timer, prompts, candidate
controls, and review actions arranged for a phone viewport. Shipping as
iPhone-only keeps the first App Store release aligned with the tested design and
avoids implying first-class iPad or landscape support before those layouts are
designed.

iPad support should be treated as a later product decision. It needs a dedicated
tablet layout pass, landscape behavior, and App Store screenshot and QA coverage
before `TARGETED_DEVICE_FAMILY` is expanded again.

## Verification

Release readiness for this item is covered by:

- `apps/mobile/__tests__/iosDeviceTargets.test.js`, which asserts the iPhone
  target family, portrait-only Info.plist orientation, iOS 15.1 deployment
  target, and this documented decision.
- `apps/mobile/__tests__/PracticePocScreen.test.tsx`, which renders the main app
  shell under compact iPhone SE-sized and modern iPhone-sized portrait
  viewports.
- Simulator build checks on the smallest available iPhone simulator and the
  current flagship simulator before App Store submission.

If the local Xcode install does not include an iPhone SE runtime, use the
smallest available iPhone simulator for native build verification and keep the
component test as the deterministic SE-sized layout check.
