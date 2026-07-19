# Chessticize Mobile Interaction Lab

The Interaction Lab is the development-only browser rendering of the real shared React Native UI. It is the living UI documentation baseline and the fastest place to review copy, spacing, hierarchy, responsive layout, and non-native interaction proposals from a phone or desktop browser.

It is not a separate HTML mockup and is not a production web app. Stories render `apps/mobile/src/components/PracticePocScreen.tsx` through React Native Web with deterministic `PracticeService` and `MemoryStore` fixtures.

## Storybook-first UI flow gate

Every new UI flow starts here before product wiring. Build the interactive
design slice with production-intended presentation components and deterministic
fixtures, publish its stable Storybook URL, and obtain explicit design approval.
During this phase, do not add the production navigation entry, backend or
storage mutations, native-module wiring, analytics, or rollout logic. After
approval, keep the scenario as living UI documentation while wiring the real
product boundaries.

The complete definition, exceptions, approval record, and handoff checklist are
in [`docs/agents/ui-flow-design.md`](../../docs/agents/ui-flow-design.md).

## Start the lab

From the repository root:

```sh
pnpm install
pnpm mobile:storybook
```

Storybook listens on `0.0.0.0:6006` and prints both local and network URLs. Connect a phone to the same Wi-Fi network and open the network URL. The Storybook manager is useful on desktop; on a phone, expand the small scenario control at the bottom-left and use **Full-screen URL** to open or bookmark the direct story.

Each scenario reloads with the same fixed clock, puzzle selection, memory state, platform capabilities, and play-function setup. Use **Reset scenario** to reload that deterministic state.

The viewport toolbar includes:

- Phone portrait: 390 × 844.
- Phone landscape: 844 × 390.
- Regular width: 1180 × 820.

## Validate the lab

```sh
pnpm mobile:lab:typecheck
pnpm mobile:lab:test
pnpm mobile:storybook:build
pnpm mobile:lab:check-markers
```

Or run the typecheck, registry tests, and static build together:

```sh
pnpm mobile:lab:validate
```

The path-scoped Interaction Lab workflow runs for changes under `apps/mobile-lab`, `apps/mobile/src`, shared packages, or relevant workspace configuration. It does not fetch the LFS puzzle pack.

## Browser boundaries

- `react-native-chessboard` resolves to `BoardPlaceholder.tsx`. It preserves the requested board geometry, displays FEN/orientation/input-lock state, implements `move`, `resetBoard`, and `getState`, and exposes conspicuous **LAB ONLY** controls for correct, wrong, and complete-puzzle transitions.
- The mobile puzzle factory resolves to a browser adapter with a small deterministic synthetic pack and the real `PracticeService` plus `MemoryStore`.
- Native notification scheduling resolves to a browser adapter. Permission variants use a maintained interface-compatible fake.
- No simulator, device, SQLite database, notification permission, iCloud account, bundled Stockfish process, or real user data is used.

The lab does not replace native validation for board rendering and gestures, Safe Area behavior, native/predictive Back, real notification delivery, iCloud, SQLite, Stockfish, or final iOS and Android acceptance.

## Scenario registry and scope

`src/scenarioRegistry.ts` is the typed catalog. Every scenario declares:

- A stable Storybook story ID.
- A Scenario Scope with included interactions and documented exits.
- A containment mode.
- An optional New Scenario Marker.

The registry maps every member of `MobileBackTab`, `MobileBackTransient`, and `MobileBackDetail["kind"]` to a Lab Scenario or an explicit not-cataloged reason. Adding a navigation union member without updating that map fails typecheck.

Whole-screen stories are currently marked `free-roam`, matching the monolithic `PracticePocScreen` navigation seam. As presentation areas are extracted, their stories can move to contained navigation with visible boundary destinations. `System / Full App (free roam)` remains the deliberate exploratory entry.

## Add or change a scenario

1. For a new UI flow, confirm that the PR is still in the Storybook design phase described in `docs/agents/ui-flow-design.md`.
2. Seed starting data through `PracticeService`, `MemoryStore`, or an interface-compatible native-boundary fake in `LabScenario.tsx`.
3. Add the typed definition and navigation coverage in `scenarioRegistry.ts`.
4. Export a Storybook story in the appropriate product group. A short play function may drive public UI actions after seeding.
5. While design review is active, add `isNew: true` and a one-line `changeNote` to the registry entry. This adds the Storybook `new` tag and the What's New card.
6. Record the stable Storybook URL and explicit design approval in the PR before product wiring starts.
7. Clear the marker before marking the pull request ready. CI allows markers on draft pull requests and rejects them on ready pull requests or `main`.
8. Keep focused mobile component tests for shared production UI changes. Use native validation only when the changed boundary requires it under the repository risk rules.
