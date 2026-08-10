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

A current request to create, show, or deliver a Storybook or visual UI design
includes authorization for the complete review handoff: create the issue
branch, push the reviewed commit, open or update its PR, publish the
branch-owned public Storybook preview, and link that preview from the issue.
It does not authorize merge or product implementation. Treat older issue text
such as “no branch/PR at this stage” as historical scope once the current user
requests the design; only a current instruction such as “local only”, “do not
push”, or “do not open a PR” stops publication.

1. Locate the existing product-clone scenario first. Update it in place and
   retain its stable Storybook URL. Add a typed scenario only when no existing
   product destination or state can represent the proposed change.
2. Cover the entry state, primary interaction, and resulting state. Add loading,
   empty, error, permission, or recovery variants when they materially affect
   the flow.
3. Exercise public actions in the Story play function where useful. Keep board
   and native boundaries behind the conspicuous Lab placeholders or maintained
   fakes.
4. Reset `newScenarioMarkers.json`, then add only the current issue's changed
   scenarios with an `issues` array, `issueNumber`, and concise `changeNote`.
   Starting a new issue-scoped Storybook design removes every marker from
   earlier design tracks, even when an earlier issue remains open. The registry
   derives `isNew: true` from the current non-empty array.
5. Run `pnpm mobile:lab:validate` and the relevant component tests without
   launching a local Storybook server. Localhost is not a design-review surface.
6. Push the exact reviewed commit, open or update the issue-scoped PR, and wait
   for the Mobile Interaction Lab GitHub Actions workflow to deploy the full Storybook.
   Perform browser checks at the affected viewports on that branch's
   stable Vercel alias. Share its manager URL and direct story URL, with the
   current delta highlighted by the `new` tag and What's New page.
7. Record explicit design approval in the issue or PR before product wiring.

Every requested Storybook design is a remote preview request. Push the reviewed
exact commit and let the Mobile Interaction Lab GitHub Actions workflow deploy the complete
`apps/mobile-lab` Storybook to the repository's existing shared Vercel project.
GitHub Actions is the only deployment writer: feature work must not create a
Vercel project or run `vercel link` or `vercel deploy` locally. Each feature
branch owns an isolated Preview deployment and stable branch alias inside the
shared project; later pushes advance only that alias, while `main` owns the
long-lived Production catalog. Never reuse a URL from a different source
branch, including another branch for the same issue. Before handoff, verify that
Vercel records the reviewed source branch and exact commit. A mismatch is a
publication blocker, not permission to replace another branch's deployment.
Every Storybook deployment is public and must not require authentication. The
workflow verifies that an unauthenticated request to `/storybook/` returns HTTP
200. Record the branch, exact source commit, stable branch URL, direct story
URL, and successful workflow run in the issue and PR. Follow
`docs/STORYBOOK_DEPLOYMENT.md` for setup and recovery.
If publication is unavailable after a concrete deployment attempt, an explicit
repository-owner authorization may waive this gate for that PR. Record the
failed publication result, the site's resulting access state, the owner's
authorization, and the follow-up needed before handoff or merge. Keep any
usable owner-only deployment in place; never substitute or overwrite another
branch's review deployment.
Do not commit generated Storybook bundles, copied preview files, `.vercel/`
project-link metadata, or hosting result files to the application branch. A
Vercel deployment remains a design artifact: it does not count as approval or
product implementation.

When the current interaction increment is coherent and checks pass, the design
PR may become ready and merge to `main` before approval or implementation.
Continue later feedback rounds from current `main`, update the same scenario,
and let CI publish the new branch's stable Preview alias inside the shared
Vercel project. Retain every approved scenario as living UI documentation. When
the next issue-scoped Storybook design begins, reset all prior marker entries
before adding that design's current issue markers. Pull-request CI rejects a
new issue marker while any earlier issue marker remains.

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
5. Keep the approved Storybook scenario as living documentation. Its `new`
   marker remains only until the next issue-scoped Storybook design resets the
   manifest.

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
