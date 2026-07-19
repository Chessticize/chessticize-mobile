# Storybook-First UI Flow Design Gate

New UI flows must pass an interactive Storybook design review before production
implementation begins. The Interaction Lab is the presentation contract: it
uses production-intended React Native components with deterministic browser
fixtures, not a parallel HTML mockup.

## What Requires The Gate

Use this gate for any new:

- Screen or navigation destination.
- Stateful modal, sheet, overlay, or editor.
- Multi-step user journey or materially different branch in an existing journey.
- Loading, empty, error, permission, or recovery path that changes what the user can do next.

Small copy, spacing, accessibility, or bug fixes inside an already approved flow
do not automatically restart the gate. If the change alters the journey,
information hierarchy, or available actions, treat it as a new flow branch and
run the gate.

## Phase A: Interaction Lab Design

Work in a draft feature PR. The design phase may add the production-intended
presentation component, typed view data, deterministic `PracticeService` or
`MemoryStore` fixtures, and maintained native-boundary fakes. It must not begin
production wiring: do not add the production navigation entry, persistent
storage or backend mutation, native-module integration, analytics, feature
rollout, or release integration yet.

1. Add the typed Lab Scenario and stable Storybook URL.
2. Cover the entry state, primary interaction, and resulting state. Add loading,
   empty, error, permission, or recovery variants when they materially affect
   the flow.
3. Exercise public actions in the Story play function where useful. Keep board
   and native boundaries behind the conspicuous Lab placeholders or maintained
   fakes.
4. Mark the scenario with `isNew: true` and a concise `changeNote` while design
   review is active.
5. Run `pnpm mobile:lab:validate`, the relevant component tests, and browser
   checks at the viewports affected by the design.
6. Share the stable Storybook URL and record explicit design approval in the PR.

Do not infer approval from a passing test, an open PR, or the absence of
comments. Approval must be an affirmative user or designer decision recorded in
the PR description or discussion.

## Phase B: Product Implementation

Only after explicit design approval:

1. Wire the approved presentation into real navigation and product state.
2. Add backend, storage, native-module, analytics, and rollout behavior as the
   feature requires, keeping business decisions outside React components.
3. Keep the approved Storybook scenarios current as living UI documentation;
   do not replace them with a separate mock implementation.
4. Add the appropriate core, storage, component, integration, and native
   validation from the development-loop skill.
5. Clear the New Scenario Marker before the PR becomes ready for review.

The design and implementation phases may stay in one feature-scoped PR. Keep it
draft while the stated goal is incomplete, and make the Storybook-first sequence
visible in the commits and PR record.

## Native-Only Boundaries And Urgent Fixes

If part of the flow cannot run in React Native Web, design the presentation and
all reachable non-native states in Storybook, mark the native exit clearly, and
record why simulator or device evidence is still required. Native-only behavior
does not automatically waive the design gate.

An urgent regression fix to an existing approved flow may proceed directly to
the smallest proving test layer. If the fix introduces a new journey or action,
it must return to Phase A first.
