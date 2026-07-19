---
name: chessticize-mobile-ui-calibration
description: Capture and visually calibrate Chessticize Mobile's Storybook Interaction Lab against an exact-head iOS Release simulator build across the eight maintained baseline scenes, archive local screenshots, enforce production-only UI, and record PR evidence. Use when UI work needs native screenshot parity, when Storybook may differ from the real app, when Custom Setup or Review controls need verification, when refreshing the project's foundational UI screenshots, or before preparing App Store screenshot sets.
---

# Chessticize Mobile UI Calibration

Compare the Storybook presentation contract with product-accurate Release
simulator rendering. Use the maintained eight-scene Detox journey so future
calibration stays repeatable instead of depending on manually seeded app data.

## Safety And Scope

- Use a dedicated simulator such as `iPhone 17-Detox`. Never use a simulator
  that contains manual-test data; Detox launches with `delete: true`.
- Commit the intended changes and require a clean tracked worktree before
  producing exact-head evidence. Any later code change invalidates it.
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
DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh
```

The script:

1. Requires macOS, a clean worktree, and a fixed Git `HEAD`.
2. Runs `pnpm mobile:doctor:ios`.
3. Builds the Release simulator app with bundled JavaScript.
4. Runs the deterministic eight-scene store-assets journey with one worker.
5. Copies the eight PNGs to
   `scratch/rendering-checks/<short-sha>/release/`.
6. Confirms that `HEAD` and the tracked worktree did not change.

Set `CHESSTICIZE_IOS_PREPARE=1` only when the CocoaPods workspace or locked
bundle genuinely needs preparation. Environment preparation must not update
tracked lockfiles unintentionally.

### 3. Inspect all eight scenes

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

Compare hierarchy, copy, wrapping, disabled states, Safe Area, board geometry,
and bottom-tab overlap against Storybook. Treat Storybook as the design
contract and Release simulator screenshots as native acceptance evidence.

### 4. Fix and repeat

When a mismatch is real:

1. Add or update a component regression test when the public behavior can be
   asserted below the simulator layer.
2. Fix the shared production component rather than adding a Storybook-only
   imitation.
3. Run focused component tests and `pnpm mobile:typecheck`.
4. Commit the change, rerun the capture script, and inspect all eight images.

Do not add pixel-perfect native snapshot diffs by default. System fonts,
rendering versions, and antialiasing create noisy changes; keep semantic
assertions automatic and visual judgment explicit.

## Other Device Families

Change only `DETOX_IOS_DEVICE` to reuse the same journey on another dedicated
simulator. Before App Store upload, capture and inspect the required 6.9-inch
iPhone, 6.1-inch iPhone, and 13-inch iPad sets, then run:

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
- If the screenshot command passes but fewer than eight PNGs are found, inspect
  the Detox artifact directory and the first failing scene before rerunning.
- If Debug controls appear, confirm the build configuration is
  `ios.sim.release`; do not accept the images as a production baseline.

## Record Evidence

Update the PR validation record with:

- Full tested commit SHA and clean-worktree confirmation.
- Simulator name and Release build result.
- Capture command and Detox pass count.
- Local screenshot directory.
- The Storybook URL reviewed.
- Visual findings, especially Custom Setup heading removal, Review CTA/debug
  isolation, board arrows, clipping, wrapping, and Safe Area behavior.
- Any required device families or final App Store assets still outstanding.
