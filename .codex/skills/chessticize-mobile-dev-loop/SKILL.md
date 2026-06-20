---
name: chessticize-mobile-dev-loop
description: Use when developing Chessticize Mobile features, choosing the right validation layer, testing core/backend logic, running CLI end-to-end checks, testing React Native UI, or deciding when to use iOS simulator, Detox, and screenshots.
---

# Chessticize Mobile Dev Loop

Use this skill before changing Chessticize Mobile behavior or declaring work complete. Prefer the cheapest test layer that proves the behavior, then escalate only when the change crosses a boundary that cheaper tests cannot cover.

## Default Order

1. **Core/backend logic first**
   - Put sprint rules, ELO, puzzle selection, Arrow Duel correctness, review scheduling, history filtering, pack validation, sync merge, and engine orchestration outside React components.
   - Backend/domain code must run in Node tests without React Native, simulator, navigation, gestures, or visual components.
   - Use real internal implementations where practical. Use maintained fakes behind public interfaces for deterministic storage, sync, engine, or failure cases. Avoid ad hoc mocks for internal code.

2. **CLI and process-boundary validation**
   - Use the CLI to verify behavior through a real process boundary when core/storage/API behavior changes.
   - CLI E2E should start the real CLI and interact through stdin/stdout or public command interfaces, not by calling services directly.

3. **Mobile component behavior**
   - For normal UI state, labels, tabs, timers, history filters, settings toggles, pack rows, and service wiring, use Jest/component tests.
   - Prefer `apps/mobile/__tests__/PracticePocScreen.test.tsx` style tests before simulator tests.
   - Mock only external/native rendering boundaries that Jest cannot host, such as the chessboard component. Keep assertions on public UI behavior, testIDs, accessibility labels, and user-visible text.

4. **Native/simulator validation**
   - Use iOS simulator only when validating real rendering, gestures, Safe Area behavior, native modules, Skia/chessboard rendering, animations, iOS build issues, or final acceptance.
   - Use Detox for repeatable GUI automation and screenshot capture.
   - Use manual simulator checks only when Detox cannot exercise a required interaction yet; report that gap.

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
- Settings/Packs reachability and local-only toggles.

Do not start the simulator for every UI text/layout/state change. If `react-native-chessboard` is mocked in Jest, remember that Jest proves prop wiring and UI state, not real piece rendering or gestures.

## iOS Simulator And Detox

Use this when a change affects native or rendered behavior:

```sh
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios
DETOX_IOS_DEVICE="iPhone 17" pnpm mobile:e2e:test:ios
```

Replace `iPhone 17` with an installed simulator from:

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

After JavaScript changes, rebuild the Detox app before trusting screenshots:

```sh
pnpm mobile:e2e:build:ios
```

Detox uses the built app bundle. It will not automatically pick up Metro-only edits unless the app is rebuilt.

## Screenshot Verification

Take or inspect screenshots when validating:

- Real chessboard piece rendering.
- Arrow Duel candidate arrows and review colors.
- Responsive/adaptive layout on a new viewport or device family.
- Safe Area, notches, landscape, iPad, or unusual aspect ratios.
- Visual regressions found during simulator/manual review.

Preferred flow:

1. Add or update a Detox spec that reaches the target screen through public UI.
2. Use `device.takeScreenshot("name")` at the important state.
3. Run Detox and inspect artifacts under `apps/mobile/artifacts/`.
4. Copy useful local evidence into `scratch/rendering-checks/` if needed. `scratch/` is ignored and suitable for private local evidence.
5. Do not commit raw screenshots unless a review explicitly asks for published visual artifacts.

Use screenshot evidence to catch issues that Jest cannot see. Example: Arrow Duel arrows may pass component tests while failing to draw correctly on iOS.

## Completion Checklist

Before finalizing:

- State which public behavior changed.
- State which test layers were updated and why.
- Run the focused tests that match the changed layer.
- Run broader tests when touching shared core, storage, CLI, or native boundaries.
- Mention any intentionally skipped layer, with the reason.
- Keep generated artifacts out of git unless they are intentional fixtures.
