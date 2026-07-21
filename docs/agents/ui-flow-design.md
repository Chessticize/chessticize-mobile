# Storybook-First UI Flow Design Gate

New UI flows must pass an interactive Storybook design review before production
implementation begins. The Interaction Lab is the presentation contract: it
uses production-intended React Native components with deterministic browser
fixtures, not a parallel HTML mockup.

The full catalog must read as the expected post-implementation product. If the
affected screen or flow already has a product-clone story, modify that existing
story incrementally and preserve its stable URL.
Do not create a parallel standalone page merely to isolate the new control.
Create a new scenario only for a destination or materially distinct state that
would actually be new in the product. The `new` tag highlights the delta; it
does not separate that delta from the rest of the product UI.

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

Work in an issue-scoped design PR. Keep it draft only while the current design
increment is incomplete. The design phase may add the production-intended
presentation component, typed view data, deterministic `PracticeService` or
`MemoryStore` fixtures, and maintained native-boundary fakes. It must not begin
production wiring: do not add the production navigation entry, persistent
storage or backend mutation, native-module integration, analytics, feature
rollout, or release integration yet.

1. Locate the existing product-clone scenario first. Update it in place and
   retain its stable Storybook URL. Add a typed scenario only when no existing
   product destination or state can represent the proposed change.
2. Cover the entry state, primary interaction, and resulting state. Add loading,
   empty, error, permission, or recovery variants when they materially affect
   the flow.
3. Exercise public actions in the Story play function where useful. Keep board
   and native boundaries behind the conspicuous Lab placeholders or maintained
   fakes.
4. Add the scenario to `newScenarioMarkers.json` with its owning `issueNumber`
   and a concise `changeNote`; the registry derives `isNew: true` from it.
5. Run `pnpm mobile:lab:validate`, the relevant component tests, and browser
   checks at the viewports affected by the design.
6. Deploy the full Storybook from the exact reviewed commit. Share its manager
   URL and the direct story URL, with the delta highlighted by the `new` tag and
   What's New page.
7. Record explicit design approval in the issue or PR before product wiring.

When remote preview publication is authorized and Sites is available, publish
the complete `apps/mobile-lab` Storybook to an issue-specific site or deployment
and record the exact source commit in the issue and PR. Do not commit generated
Storybook bundles, copied preview files, or hosting result files to the
application branch. A Sites deployment is a production URL, but it remains a
design artifact: it does not count as approval or product implementation. Save
a Sites version without deploying it when only a reviewable candidate is
authorized.

When the current interaction increment is coherent and checks pass, the design
PR may become ready and merge to `main` before approval or implementation.
Continue later feedback rounds from current `main`, update the same scenario,
and redeploy the issue's full Storybook. Keep its New Scenario Marker on `main`
until the linked GitHub issue is closed; then remove only the marker in a cleanup
change and retain the scenario as living UI documentation. Pull-request CI
checks the issue state before allowing that removal.

If an open issue's marker was attached to a mistaken parallel prototype,
consolidate that prototype into the existing product-clone scenario and move
the same issue ownership to it. This is a marker correction, not marker cleanup;
the issue must remain represented by a `new` marker until it closes.

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
5. Keep the issue-owned New Scenario Marker until the linked issue closes.

Product implementation normally begins in a later feature-scoped PR from the
approved design on `main`. Keep any PR draft while its stated goal is incomplete,
and make the Storybook-first sequence visible in the issue and PR record.

## Native-Only Boundaries And Urgent Fixes

If part of the flow cannot run in React Native Web, design the presentation and
all reachable non-native states in Storybook, mark the native exit clearly, and
record why simulator or device evidence is still required. Native-only behavior
does not automatically waive the design gate.

An urgent regression fix to an existing approved flow may proceed directly to
the smallest proving test layer. If the fix introduces a new journey or action,
it must return to Phase A first.
