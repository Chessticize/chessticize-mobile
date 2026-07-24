---
name: chessticize-mobile-dev-loop
description: Use when developing Chessticize Mobile features, choosing the right validation layer, testing core/backend logic, running CLI end-to-end checks, testing React Native UI, or deciding when to use iOS simulator, Detox, and screenshots.
---

# Chessticize Mobile Dev Loop

Use this skill before changing Chessticize Mobile behavior or declaring work complete. Prefer the cheapest test layer that proves the behavior, then escalate only when the change crosses a boundary that cheaper tests cannot cover.

## Storybook-First UI Flow Gate

For every new UI flow, stop before product wiring and complete the Interaction
Lab design phase first. Follow `docs/agents/ui-flow-design.md`.

1. Start from the existing product-clone story whenever the affected screen or
   flow already exists. Make an incremental change in that screen and keep its
   stable Storybook URL; do not invent a separate page that repeats the product
   context. Add a new scenario only when the product would truly gain a new
   destination or materially distinct state with no existing clone.
2. Make the complete Storybook show the expected product after implementation,
   with the issue-owned `new` marker identifying only the changed scenario.
   Include the important entry, interaction, success, loading, empty, error, or
   permission states that apply.
3. Keep this phase isolated from production navigation entries, backend or
   storage mutations, native-module wiring, analytics, and rollout logic.
4. Add the issue-owned New Scenario Marker, run the Lab checks, and deploy the
   full Storybook from the exact commit through a site dedicated to the current
   feature branch. Never reuse that Sites project or URL for another branch;
   stop if the deployment input names a different branch or commit. Generated
   deployment files stay outside the application branch. Every Storybook review
   site, including the main-branch catalog and every branch-owned site, is public
   and must not require authentication. Verify an unauthenticated request to
   `/storybook/` returns HTTP 200 before handoff.
5. Merge coherent design increments to `main` and iterate from current `main`;
   retain the marker until the linked issue closes.
6. Record explicit design approval in the issue or PR before starting product
   wiring.
7. After approval, retain the Storybook scenario as living UI documentation and
   continue with the implementation and validation order below.

This gate applies to a new screen, navigation destination, stateful modal or
sheet, multi-step journey, or materially new loading, empty, error, or
permission path. A small fix to an already approved flow does not automatically
restart the gate unless it materially changes the journey.

## Default Order After Design Approval

1. **Core/backend logic first**
   - Put sprint rules, ELO, puzzle selection, Arrow Duel correctness, review scheduling, history filtering, pack validation, sync merge, and engine orchestration outside React components.
   - Backend/domain code must run in Node tests without React Native, simulator, navigation, gestures, or visual components.
   - Use real internal implementations where practical. Use maintained fakes behind public interfaces for deterministic storage, sync, engine, or failure cases. Avoid ad hoc mocks for internal code.

2. **CLI and process-boundary validation**
   - Use the CLI to verify behavior through a real process boundary when core/storage/API behavior changes.
   - CLI E2E should start the real CLI and interact through stdin/stdout or public command interfaces, not by calling services directly.

3. **Mobile component behavior**
   - For normal UI state, labels, tabs, timers, history filters, settings toggles, Settings source/license rows, and service wiring, use Jest/component tests.
   - Prefer `apps/mobile/__tests__/PracticePocScreen.test.tsx` style tests before simulator tests.
   - Mock only external/native rendering boundaries that Jest cannot host, such as the chessboard component. Keep assertions on public UI behavior, testIDs, accessibility labels, and user-visible text.

4. **Native/simulator validation**
   - Required native validation is limited to release candidates and changes to native implementation, native integration/configuration, native dependencies, or native validation infrastructure.
   - For JavaScript/TypeScript-only rendering, gestures, Safe Area behavior, chessboard presentation, animations, navigation, and adaptive layout, use component and Interaction Lab coverage. A simulator remains optional for visual acceptance but is not a merge gate.
   - Use Detox for repeatable GUI automation and screenshot capture.
   - Use a focused simulator screenshot for one-off visual acceptance. Add or run Detox when a native boundary or release journey needs repeatable regression coverage.

## Core And Storage Commands

Run from the repository root:

```sh
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm typecheck
```

Use focused commands while iterating:

```sh
pnpm test
pnpm typecheck
```

When touching only pure core rules, `pnpm test:unit` plus `pnpm typecheck` is usually enough. When touching storage, store contracts, review queues, ratings persistence, or SQLite behavior, include `pnpm test:integration`. When touching CLI commands, JSON protocol, stdin/stdout behavior, or process boundaries, include `pnpm test:e2e`.

## CLI E2E Expectations

CLI E2E tests should prove:

- Standard sprint behavior through a real CLI process.
- Arrow Duel wrong choices and non-candidate moves through the public CLI surface.
- History, due review queue, ratings, and completed sprint state as serialized output.
- Failure cases such as invalid commands or exhausted/failed sprint paths when relevant.

Do not replace CLI E2E with direct service calls. If a CLI test fails, inspect stdout/stderr and update the public contract or test fixture intentionally.

## Mobile Jest Loop

Use this loop for ordinary React Native UI changes:

```sh
pnpm mobile:test
pnpm mobile:typecheck
```

Component tests should cover:

- App shell navigation and stable automation IDs.
- Standard sprint start, board move callback wiring, timer/progress/mistake labels, abandon/reset, and summary behavior.
- Arrow Duel candidate display, non-candidate wrong moves, feedback colors, and review text.
- History filters and performance summaries.
- Settings reachability, puzzle source/license attribution, and local-only toggles.

Do not start the simulator for every UI text/layout/state change. If `react-native-chessboard` is mocked in Jest, remember that Jest proves prop wiring and UI state, not real piece rendering or gestures.

## iOS Simulator And Detox

Use this as a required gate for native-impacting changes and releases, or as an
optional acceptance tool for non-native visual work:

Before booting or creating a simulator, inspect the existing simulator devices
and reuse a compatible device whenever it satisfies the required runtime,
device profile, and test-isolation boundary. Start a different simulator only
when no existing device is suitable. Continue to keep manual testing and Detox
on separate devices as described below.

```sh
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios
DETOX_IOS_DEVICE="iPhone 17-Detox" pnpm mobile:e2e:test:ios
```

Use a dedicated Detox simulator, not the simulator used for manual testing. Detox specs call `device.launchApp({ delete: true })`, which resets the app sandbox and deletes local SQLite history, sprint sessions, and review queue data. Replace `iPhone 17-Detox` with another dedicated installed simulator from:

```sh
xcrun simctl list devices available
```

Before running Detox for the first time on a machine or after Xcode changes:

- Ensure `applesimutils` is installed.
- If Detox reports a missing framework cache, run:

```sh
pnpm --filter ChessticizeMobile exec detox clean-framework-cache
pnpm --filter ChessticizeMobile exec detox build-framework-cache
```

When native validation is required after a JavaScript change to a tested release
journey, rebuild the Detox app before trusting screenshots:

```sh
pnpm mobile:e2e:build:ios
```

Detox uses the built app bundle. It will not automatically pick up Metro-only edits unless the app is rebuilt.

## Android Validation

Use `docs/ANDROID_VALIDATION.md` for the reproducible commands, evidence schema,
and physical ARM64 release checklist. Start with:

```sh
pnpm mobile:doctor:android
adb devices -l
emulator -list-avds
```

Choose the smallest proving Android layer:

- **No Android Detox** for every non-release change without an Android native
  impact, including JavaScript/TypeScript navigation, persistence journeys,
  board presentation, animations, and adaptive layout already proven below
  native.
- **Targeted Android validation** for one bounded Android platform surface,
  native bridge/adapter, native dependency, platform project/configuration, or
  a release candidate with one affected native journey.
- **Full Android validation** for broad native startup, shared native
  navigation/storage wiring, native launch fixtures, platform build
  configuration, Detox infrastructure, or release risk that cannot be bounded.
  Build once, then run complete shared `flows` and `practice`.

For an already built app on an attached emulator, the CI-equivalent runner is:

```sh
ANDROID_VALIDATION_COMMIT_SHA=<exact-40-character-sha> \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI=x86_64 \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE=emulator-5554 \
pnpm mobile:validate:android:matrix -- --api-level 36 \
  --output apps/mobile/artifacts/android-validation/api-36.json
```

API 24 is a bounded launch/storage/practice/native-engine smoke. API 36 owns the
complete shared suites. Required evidence records its tested commit, build
result, commands, device matrix, suite results, and clean tracked worktree
confirmation. It may be reused on a later head when a documented diff proves
that validation-relevant development inputs are unchanged. Physical ARM64
evidence is owner-recorded at #200/#188 and is not a routine feature-PR blocker.

## PR, Local Native, And Release Gates

Native validation is required only for a release candidate or a change to
native implementation, native integration/configuration, native dependencies,
or native validation infrastructure. Choose the smallest required scope:

- **No mobile Detox** for every non-release PR without a native impact, including JavaScript/TypeScript navigation, multi-screen journeys, relaunch state orchestration, board presentation, animations, adaptive layout, copy, state, styling, accessibility, and service wiring already covered by lower layers.
- **Targeted native validation** for a bounded native bridge/adapter change, native dependency or platform-project change, native persistence/relaunch integration, or a release candidate with one affected native journey. Run the affected spec or one affected suite (`flows` or `practice`).
- **Full native validation** only for broad native risk such as app startup, shared native navigation/storage wiring, global native launch fixtures, platform build configuration, Detox infrastructure, or a release candidate whose native risk cannot be bounded to one suite.

Use the risk-scoped runner for suite-level evidence:

```sh
CHESSTICIZE_E2E_SCOPE=practice \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
```

Replace `practice` with `flows` or `full` as required. Record the scope, tested
commit SHA, build result, commands, results, and clean-worktree confirmation in
the PR. The evidence does not have to match the current PR head when a
documented diff proves that validation-relevant development inputs are
unchanged. Those inputs include mobile runtime sources, native/platform
projects, dependency manifests, lockfiles and patches, build/release
configuration, and the selected native specs and fixtures. Documentation,
review metadata, and merge-parent changes alone do not invalidate evidence.
All relevant fast CI checks must still pass on the current head.

GitHub Actions does not run Xcode builds or iOS Detox. Local iOS native
validation is required only for releases and native-impacting changes. Release
candidates use the same risk scopes: a delta needs exact-head fast checks plus
owner device smoke, targeted native risk needs the affected suite, and only
broad native risk requires both suites. After a later commit or squash merge,
reuse passing native evidence when a documented diff confirms that the
validation-relevant development inputs are unchanged; record both SHAs and the
comparison rather than requiring identical full Git trees.

### Prefer Incremental Review

After a coherent PR has an accepted review baseline, review only the new diff,
its directly affected contracts, and unresolved findings by default. Record the
checkpoint in the PR body or a new PR comment as `Review-Mode`,
`Review-Baseline`, `Reviewed-Through`, and `Review-Result: pass`, with full
40-character commit SHAs. On the next pass, use the latest passing
`Reviewed-Through` SHA only after confirming that it is an ancestor of the
current head, then review `Reviewed-Through..current-head`. The first full PR
review uses the PR merge base as `Review-Baseline`; an incremental review uses
the prior passing `Reviewed-Through`. Re-anchor a non-ancestor checkpoint only
when `git range-diff` or equivalent evidence proves patch equivalence. Do not
repeat an unchanged full review for a small follow-up or CI retry, and do not
rerun unaffected tests merely to make the review look fresh.

Escalate to a full review of the coherent change set only when the accepted
baseline cannot be trusted, the goal/specification or architecture boundary
materially changes, **Full native validation** is selected, release identity or
signing changes, privacy/security or schema/migration behavior changes, global
launch/test infrastructure changes, a serious finding invalidates earlier
assumptions, or accumulated follow-ups no longer have a bounded semantic impact.
Use semantic blast radius rather than line count. Reusing review does not make
native evidence automatically reusable: required fast checks must pass on the
current head, and any native evidence must either cover the current
validation-relevant development inputs or include a documented unchanged-input
comparison.

## Screenshot Verification

For repeatable Storybook-to-Release comparison across the maintained eight
scenes, use `$chessticize-mobile-ui-calibration`. Keep this section's manual
flow for one-off screenshots outside that baseline.

Take or inspect screenshots when validating:

- Real chessboard piece rendering.
- Arrow Duel candidate arrows and review colors.
- Responsive/adaptive layout on a new viewport or device family.
- Safe Area, notches, landscape, iPad, or unusual aspect ratios.
- Visual regressions found during simulator/manual review.

Preferred flow:

1. Reach the target through public UI. Add or update a Detox spec when the regression should be repeatable; otherwise use the manual simulator for one-off acceptance.
2. Use `device.takeScreenshot("name")` or `xcrun simctl io booted screenshot <path>` at the important state.
3. Inspect the screenshot or Detox artifacts under `apps/mobile/artifacts/`.
4. Copy useful local evidence into `scratch/rendering-checks/` if needed. `scratch/` is ignored and suitable for private local evidence.
5. Do not commit raw screenshots unless a review explicitly asks for published visual artifacts.

Use screenshot evidence to catch issues that Jest cannot see. Example: Arrow Duel arrows may pass component tests while failing to draw correctly on iOS.

## Completion Checklist

Before finalizing:

- State which public behavior changed.
- State which test layers were updated and why.
- Run the focused tests that match the changed layer.
- Run broader tests when touching shared core, storage, CLI, or native boundaries.
- Record whether native validation is required and the rationale in the PR.
- When targeted or full native validation is required, record passing evidence
  for the current validation-relevant development inputs or a documented reuse
  comparison.
- Keep iOS native validation local; GitHub CI runs only the fast non-native jobs.
- Before release, require the selected local native scope or an identical-tree
  PR-head result recorded against the release candidate.
- Mention any intentionally skipped layer, with the reason.
- Keep generated artifacts out of git unless they are intentional fixtures.
