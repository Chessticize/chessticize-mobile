---
name: chessticize-mobile-ui-calibration
description: Capture and visually calibrate Chessticize Mobile's Storybook Interaction Lab against an exact-head iOS Release simulator build across the maintained portrait and landscape baseline scenes, judge functional rendering, copy quality, and presentation quality including hierarchy, alignment, typography, spacing, balance, and polish, archive local screenshots, enforce production-only UI, and record PR evidence. Use when UI work needs native screenshot parity, copy review, or aesthetic and layout review, when Storybook may differ from the real app, when Custom Setup or Review controls need verification, when refreshing the project's foundational UI screenshots, or before preparing App Store screenshot sets.
---

# Chessticize Mobile UI Calibration

Compare the Storybook presentation contract with product-accurate Release
simulator rendering. Use the maintained fifteen-scene Detox journey plus its
eleven adaptive-layout landscape captures so future calibration stays
repeatable instead of depending on manually seeded app data.

## Safety And Scope

- Use a dedicated simulator such as `iPad Pro 11-inch (M5)` or
  `iPhone 17-Detox`. Never use a simulator that contains manual-test data;
  Detox launches with `delete: true`.
- Keep the Mac unlocked and the exact target device window open in Simulator.
  The calibration script uses Simulator's host Rotate control because current
  iPadOS windowing modes can reject programmatic app orientation requests.
  Never add product lifecycle or native geometry code only to make calibration
  rotate.
- Do not install or launch this workflow's build on a physical device. Real
  device checks are a separate, explicitly requested workflow and are never
  accepted as substitutes for the named simulator evidence.
- Commit the intended changes and require a clean tracked worktree before
  producing exact-head evidence. Any later visual, runtime, native, dependency,
  capture-fixture, or build-configuration change invalidates it. Documentation,
  review metadata, and merge ancestry alone may reuse it when both SHAs and the
  unchanged-input diff are recorded.
- Capture Release, not Debug. Debug exposes puzzle-source and Review developer
  controls that must not appear in the product baseline.
- Keep raw screenshots under ignored `scratch/` or `apps/mobile/artifacts/`.
  Do not commit them unless final sanitized publishing assets were explicitly
  reviewed.
- Use this focused screenshot scope for visual calibration. Use
  `$chessticize-mobile-local-e2e` when native risk requires the `flows`,
  `practice`, or full Detox suite.

## Calibrate A Flow

### 1. Establish the Storybook contract

For a new UI flow, follow `docs/agents/ui-flow-design.md` before production
wiring. Start the Interaction Lab and review the affected scenario at the
relevant viewport:

```sh
pnpm mobile:storybook
```

Record the stable story URL. For an existing flow regression, use its current
story as the comparison reference and add or update component assertions before
changing the product UI.

### 2. Capture the exact-head Release baseline

Run from the repository root:

```sh
DETOX_IOS_DEVICE="iPad Pro 11-inch (M5)" \
  .codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh
```

If more than one available runtime has the same device name, also set the exact
`DETOX_IOS_DEVICE_UDID`. The resolver rejects duplicate name-only matches and
name/UDID mismatches. The resolved UDID is then shared by Xcode, Detox, host
rotation, and artifact identity so the workflow cannot build one runtime and
capture another.

The script:

1. Requires macOS, a clean worktree, and a fixed Git `HEAD`.
2. Runs `pnpm mobile:doctor:ios`.
3. Builds the Release simulator app with bundled JavaScript.
4. Runs the deterministic portrait journey, rotates the exact host Simulator
   window, then runs the separate landscape journey with one worker.
5. Copies the fifteen portrait and eleven landscape PNGs to
   `scratch/rendering-checks/<short-sha>/release-<device>-<runtime>-<udid>/`.
6. Requires the React Native adaptive-layout frame to remain in the requested
   orientation for three observations before each capture. A stale portrait
   framebuffer fails instead of being relabeled as landscape.
7. Independently reads every copied PNG header and requires portrait
   `height > width` or landscape `width > height`.
8. Arms portrait restoration before the landscape rotation attempt, then
   restores the Simulator to portrait and confirms that `HEAD` and the tracked
   worktree did not change.

Set `CHESSTICIZE_IOS_PREPARE=1` only when the CocoaPods workspace or locked
bundle genuinely needs preparation. Environment preparation must not update
tracked lockfiles unintentionally.

### 3. Inspect all twenty-six captures

Open every PNG, not only the flow that originally changed:

| Screenshot | Calibration contract |
| --- | --- |
| `app-store-01-practice-tab` | Ratings, mode selection, progress, and Review due state are readable; no test puzzle-source controls. |
| `app-store-02-review-tab` | The real blue Review CTA is present; `Make next due today` and `Test notification` are absent. |
| `app-store-03-history-tab` | Filters, pagination, and attempt rows fit without blocking overlap. |
| `app-store-04-settings-tab` | Primary settings remain readable and the screen can scroll past the tab bar. |
| `app-store-05-standard-sprint` | Board, timer, progress, mistakes, and instruction fit together. |
| `app-store-06-arrow-duel` | Both candidate arrows render on the real board without clipping. |
| `app-store-07-custom-setup` | The theme chips wrap cleanly and the theme row has no `Theme` heading. |
| `app-store-08-review-session` | Review progress, timer, real board, arrows, and instruction are visible without overlap. |
| `app-store-09-sprint-rules-guide` | First-use rules clearly distinguish target, duration, mistakes, Slow, and timeout before a Sprint starts. |
| `app-store-10-active-session-guide-header` | The Sprint header guide preserves the real hierarchy and keeps its callout legible. |
| `app-store-11-active-session-guide-slow` | The Slow guide makes the amber timing state readable without implying a user control. |
| `app-store-12-active-session-guide-timeout` | The Timed Out guide shows the automatic timeout overlay and its mistake, Unclear, and Review consequences without clipping. |
| `app-store-13-active-session-guide-unclear` | The Unclear guide explains the manual action and points to the visible control. |
| `app-store-14-arrow-duel-guide` | The Arrow Duel guide shows both candidate arrows, bounded copy, and the delayed timer start. |
| `app-store-15-sprint-result` | The failed result clearly reports reason, solved/attempted accuracy, rating, mistakes, Review impact, and history action. |

The `practice-tab`, `standard-sprint`, `arrow-duel`, and `review-session`
landscape variants, plus every first-use guide and Sprint-result landscape
variant, must preserve the native Safe Area, adaptive board/rail geometry,
readable controls, and unclipped content at the same simulator size.

Compare hierarchy, copy, wrapping, disabled states, Safe Area, board geometry,
and bottom-tab overlap against Storybook. Treat Storybook as the design
contract and Release simulator screenshots as native acceptance evidence.

Judge functional rendering and presentation quality separately. Functional
containment is necessary but not sufficient for a visual pass. For every image,
also inspect:

- Focal hierarchy and whether the reading order is obvious.
- Shared edges, columns, baselines, and alignment consistency.
- Padding, margins, spacing rhythm, density, and whitespace balance.
- Type scale, weight, line length, wrapping, and readability.
- Copy clarity, accuracy, grammar, concision, tone, product terminology, and
  consistency with the visible behavior.
- Visual balance between the board, rail, callouts, navigation, and screen
  edges.
- Consistency of colors, borders, radii, icons, and sibling-screen patterns.
- Whether guidance visually points to and plainly explains the UI element to a
  first-time user, without internal tour language, unexplained jargon, or
  redundant instructions.
- Overall polish at the tested viewport and orientation.

Treat an observable aesthetic or layout defect as a real mismatch when it
reduces scanability, comprehension, balance, consistency, or perceived quality,
even if the flow remains usable. Record the screenshot, visible symptom, and
user impact instead of reporting a vague personal preference.

Treat misleading, ambiguous, awkward, repetitive, inconsistent, or
novice-hostile copy as a real mismatch even when it renders without clipping.
The text must describe the UI and consequence the user can actually observe,
not merely mirror an internal implementation name.

### 4. Fix and repeat

When a mismatch is real:

1. Add or update a component regression test when the public behavior can be
   asserted below the simulator layer.
2. Fix the shared production component rather than adding a Storybook-only
   imitation.
3. Run focused component tests and `pnpm mobile:typecheck`.
4. Commit the change, rerun the capture script, and inspect all twenty-six
   images.

Do not add pixel-perfect native snapshot diffs by default. System fonts,
rendering versions, and antialiasing create noisy changes; keep semantic
assertions automatic and visual judgment explicit.

## Other Device Families

Change `DETOX_IOS_DEVICE` (and `DETOX_IOS_DEVICE_UDID` when the name is
ambiguous) to reuse the same journey on another dedicated simulator. Captures
remain isolated by device, runtime, and full UDID so evidence from different
frames cannot overwrite or masquerade as another device. Before App Store
upload, capture and inspect the required 6.9-inch iPhone, 6.1-inch iPhone, and
13-inch iPad sets, then run:

```sh
pnpm app-store:screenshot-audit
```

An `iPhone 17-Detox` capture is suitable for layout calibration but its raw
dimensions are not an accepted App Store upload size.

## Diagnose Failures

- If Ruby, CocoaPods, Xcode, Git LFS, Simulator, or Detox setup fails, use
  `$chessticize-mobile-local-e2e`; do not weaken package or signature checks.
- If pnpm tries and fails to verify the pinned version, use the properly
  installed repository-pinned pnpm. Never disable integrity verification.
- If CocoaPods reports `pathname contains null byte`, treat it as an environment
  preparation problem involving pnpm-linked pod paths. Do not commit an
  unrelated `Podfile.lock` rewrite to make calibration pass.
- If the screenshot command passes but fewer than twenty-six PNGs are found, inspect
  the Detox artifact directory and the first failing scene before rerunning.
- If a copied PNG fails its orientation check, reject the entire capture. Do
  not rename or manually move it into the claimed orientation set.
- If host rotation fails, unlock the Mac, open exactly one Simulator window
  whose title starts with the configured device name, and grant Accessibility
  control to the invoking terminal. Treat a frame-orientation timeout as a
  blocked calibration, not acceptable visual evidence.
- If Debug controls appear, confirm the build configuration is
  `ios.sim.release`; do not accept the images as a production baseline.

## Record Evidence

Update the PR validation record with:

- Full tested commit SHA and clean-worktree confirmation.
- Simulator name and Release build result.
- Capture command and Detox pass count.
- Local screenshot directory.
- The Storybook URL reviewed.
- Separate functional, copy, and presentation findings, including hierarchy,
  alignment, spacing, typography, whitespace balance, overall polish, novice
  clarity, terminology, Custom Setup heading removal, Review CTA/debug
  isolation, board arrows, clipping, wrapping, and Safe Area behavior.
- Any required device families or final App Store assets still outstanding.
