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

## Publish and review the lab

Do not start a local Storybook server for design review. From the repository
root, run the headless validation:

```sh
pnpm install
pnpm mobile:lab:validate
```

Then push the issue branch, open or update its PR, and wait for the Mobile
Interaction Lab GitHub Actions workflow to publish that branch's stable Vercel
Preview. Use the hosted manager and direct story URLs for desktop and phone
review. Localhost is never the review or handoff surface.

Each scenario reloads with the same fixed clock, puzzle selection, memory state, platform capabilities, and play-function setup. Use **Reset scenario** to reload that deterministic state.

The viewport toolbar includes:

- Phone portrait: 402 × 874, with the iPhone 17 Release Safe Area.
- Phone landscape: 874 × 402, with the iPhone 17 Release Safe Area.
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

Pull-request validation remains path-scoped to Interaction Lab inputs. Every
branch push validates and deploys the complete catalog through the branch's
Vercel Preview URL, or the maintained Production URL for `main`. The workflow
does not fetch the LFS puzzle pack. See
[`docs/STORYBOOK_DEPLOYMENT.md`](../../docs/STORYBOOK_DEPLOYMENT.md) for the
one-time account setup and deployment runbook.

## Browser boundaries

- `react-native-chessboard` resolves to `BoardPlaceholder.tsx`. It preserves the requested board geometry, displays FEN/orientation/input-lock state, implements `move`, `resetBoard`, and `getState`, and exposes conspicuous **LAB ONLY** controls for correct, wrong, and complete-puzzle transitions.
- The mobile puzzle factory resolves to a browser adapter with a small deterministic synthetic pack and the real `PracticeService` plus `MemoryStore`.
- Native notification scheduling resolves to a browser adapter. Permission variants use a maintained interface-compatible fake.
- The Issue #247 Settings design story plays its documented Freesound CC0 Move
  and Capture recordings after an explicit click. It does not request browser
  vibration; its visual-only haptic result is not evidence of native iOS or
  Android feel. These preview assets are not wired into the release app.
- No simulator, device, SQLite database, notification permission, iCloud account, bundled Stockfish process, or real user data is used.

The lab does not replace native validation for board rendering and gestures, Safe Area behavior, native/predictive Back, real notification delivery, iCloud, SQLite, Stockfish, or final iOS and Android acceptance.

## Scenario registry and scope

`src/scenarioRegistry.ts` is the typed catalog, and
`src/newScenarioMarkers.json` is the review-lifecycle manifest. Every scenario
declares:

- A stable Storybook story ID.
- A Scenario Scope with included interactions and documented exits.
- A containment mode.
- An optional issue-owned New Scenario Marker.

The registry maps every member of `MobileBackTab`, `MobileBackTransient`, and `MobileBackDetail["kind"]` to a Lab Scenario or an explicit not-cataloged reason. Adding a navigation union member without updating that map fails typecheck.

Whole-screen stories are currently marked `free-roam`, matching the monolithic `PracticePocScreen` navigation seam. As presentation areas are extracted, their stories can move to contained navigation with visible boundary destinations. `System / Full App (free roam)` remains the deliberate exploratory entry.

## Add or change a scenario

1. For a new UI flow, confirm that the PR is still in the Storybook design phase described in `docs/agents/ui-flow-design.md`.
2. Find the existing product-clone story for the affected screen or state and update it incrementally, preserving its stable URL. Do not add a parallel standalone page for a control that belongs on an existing screen. Add a new scenario only when the product would actually gain a new destination or materially distinct state.
3. Seed starting data through `PracticeService`, `MemoryStore`, or an interface-compatible native-boundary fake in `LabScenario.tsx`.
4. Add or update the typed definition and navigation coverage in `scenarioRegistry.ts`.
5. Export or update the Storybook story in the appropriate product group. A short play function may drive public UI actions after seeding. The complete catalog should show the expected post-implementation product; the `new` tag highlights the issue-owned delta.
6. Reset `newScenarioMarkers.json`, then add the current issue's scenario IDs and non-empty `issues` arrays for each new or materially changed scenario. Do not retain markers from an earlier design track, even when its issue remains open. Each current entry gets the issue's `issueNumber` and one-line `changeNote`. This adds `isNew: true`, the Storybook `new` tag, and the What's New card.
7. Run headless validation without starting `pnpm mobile:storybook`. Push the issue's exact commit, open or update its PR, and wait for the Mobile Interaction Lab workflow to deploy the full Storybook through the current branch's stable Vercel Preview URL. Later pushes advance only that branch URL; another branch, including one for the same issue, receives a different Preview deployment and URL, while `main` owns Production. Every deployment is public and must not require authentication. Verify the recorded branch and commit, stop rather than substitute another branch's URL, and require the workflow's unauthenticated HTTP 200 check at `/storybook/`. Record the branch, stable manager URL, direct story URL, source commit, and workflow run in the issue and PR; generated bundles, `.vercel/` project-link metadata, and hosting result files stay untracked.
8. A coherent design increment may merge to `main` before implementation. Continue later feedback in a new PR from `main`, updating the same issue-owned scenario through the new branch's dedicated deployment.
9. Retain each scenario as living UI documentation. The next new issue-scoped Storybook design resets all earlier `new` markers before adding its own; pull-request CI rejects a newly introduced issue marker while any earlier design marker remains.
10. Record explicit design approval before product wiring starts.
11. Keep focused mobile component tests for shared production UI changes. Use native validation only when the changed boundary requires it under the repository risk rules.
