---
name: chessticize-issue-triage
description: Triage new Chessticize GitHub issues into evidence-backed categories, effort bands, priorities, tracker states, dependencies, and issue-scoped UI design tracks without consolidating related tickets by default. Use when evaluating an issue batch, processing user feedback, deciding what is ready for an agent or human, estimating issue scope, suggesting related issues for human review, or routing Storybook-only UI design previews before implementation.
---

# Chessticize Issue Triage

Produce a decision-ready backlog without beginning product implementation.

## Read The Repository Contracts

Before acting, read:

- `docs/agents/issue-tracker.md` for GitHub operations.
- `docs/agents/triage-labels.md` for exact labels and the live-label preflight.
- `docs/agents/issue-triage.md` for the authoritative evaluation rubric and comment format.
- `docs/agents/ui-flow-design.md` for every UI/UX or functional issue with a
  presentation change, before preview work or product implementation.

Treat missing required labels as a tracker setup blocker. Do not substitute a
similar label.

## Respect The Requested Write Scope

- For review or reporting requests, keep GitHub and the repository read-only.
- For triage requests that authorize tracker updates, apply labels and post the
  durable triage comment described in `docs/agents/issue-triage.md`.
- Create branches, Storybook scenarios, or PRs only when the request also
  authorizes prototypes or preview publication.
- Never infer authorization to close, mark `wontfix`, or start product
  implementation.
- Relationship suggestions are advisory. Do not consolidate tickets, close one
  as a duplicate, move its acceptance criteria, or create shared design or
  implementation handling without explicit human approval for that exact
  action.

Storybook is a design artifact, not product implementation. It may contain
production-intended presentation components and deterministic fixtures, but no
production navigation, persistence or backend mutation, native integration,
analytics, rollout, or release wiring.

## Workflow

1. **Inventory the complete batch.** Query the requested label, state, date
   window, or issue numbers. Cross-check recently created unlabeled issues when
   the request says “all feedback” or otherwise implies completeness.
2. **Read the full record.** Inspect each issue body, labels, comments, linked
   issues, and relevant existing behavior. Distinguish reported fact, product
   request, and inference.
3. **Classify and estimate.** Assign category, priority, effort, confidence,
   dependencies, and a recommended tracker state using the canonical rubric.
   Estimate the complete implementation boundary, including domain, storage,
   sync, native, migration, testing, and release work that the issue actually
   crosses. Record priority in the durable comment; do not invent priority
   labels that are absent from the repository vocabulary.
4. **Resolve ambiguity safely.** Use `needs-info` for missing reproduction or
   outcome details. Use `needs-triage` when maintainer decisions remain. Do not
   disguise high uncertainty as a small estimate.
5. **Suggest relationships without consolidating tickets.** Note issues that
   share a journey, data contract, dependency, or likely implementation, but
   describe the relationship as advisory and leave shared handling as a human
   review question. Keep one Storybook design track, marker lifecycle,
   deployment, approval record, tracker state, and closure decision per issue.
   Do not consolidate, close as duplicate, or group implementation without
   explicit human approval.
6. **Prototype authorized UI issues.** For preview-enabled triage, represent
   every UI or functional-feature issue in a Storybook design slice, including
   the reachable presentation states around a native-only boundary. Follow
   `docs/agents/ui-flow-design.md`: update the existing product-clone story
   incrementally, preserve its stable URL, and make the full Storybook show the
   expected post-implementation product. Create one issue-numbered Storybook
   branch and PR per issue. Prefer two or three structurally distinct directions
   when a real design choice exists.
7. **Preserve native boundaries.** Storybook can specify perceived response,
   layout, states, and handoff copy. It cannot prove board latency, gestures,
   audio, haptics, native modules, persistence, or device behavior. Record the
   later diagnostic or validation requirement separately.
8. **Publish the record.** Post one concise triage comment per issue. For a
   prototype, add the branch, PR, full Storybook URL, direct story URL, exact
   commit, deterministic variant/state parameters, validation result, and
   explicit approval gate.
9. **Hand off by priority.** Report the complete issue count, sorted triage
   matrix, advisory relationship suggestions, preview links, blockers, and the
   next human decision. Do not present shared handling as decided.

## Storybook Preview Gate

For an authorized preview:

- Use `codex/storybook-issue-<number>-<goal>` for exactly one issue.
- Follow `docs/agents/ui-flow-design.md`: modify the existing product-clone
  story incrementally whenever it exists, preserve its stable URL, and expose
  the issue-owned delta inside the complete product catalog.
- Add every new or materially changed scenario for that issue to
  `newScenarioMarkers.json` with its owning `issueNumber` and a concise
  `changeNote`; the registry derives `isNew: true` from it.
- Link the issue in the PR and link the PR back from the issue.
- Run `pnpm mobile:lab:validate` plus focused component or type checks required
  by the presentation boundary.
- Inspect affected phone and wide viewports and exercise stable URL state.
- Push the exact reviewed commit, verify the Interaction Lab check, and deploy
  the full Storybook so the complete catalog remains browsable and the `new`
  tag highlights the issue-owned delta.
- A coherent design increment may become ready and merge to `main`; merging is
  not explicit approval and does not begin implementation. Continue later
  feedback from current `main` and update the same scenario and issue site.
- Keep the New Scenario Marker on `main` until the linked GitHub issue is closed.
  Pull-request CI verifies closure before accepting marker removal. Retain the
  scenario as living UI documentation.
- Stop after the design handoff. Do not mark the product issue
  `ready-for-agent` for implementation until the design decision and remaining
  acceptance criteria are explicit.

## Completion Standard

Do not call triage complete until every issue in the inventory has a recorded
category, priority, effort, rationale, dependency or advisory relationship
assessment, and next state. Make uncertainty and human-review decisions
visible. Triage completion never implies approval to consolidate tickets.

## Hosted Preview Handoff

When the request authorizes remote preview publication and Sites is available:

- Build the complete `apps/mobile-lab` Storybook from the issue branch's exact
  reviewed commit and deploy it to a stable issue-specific site or deployment.
- Follow the Sites build and hosting skills. Package the matching static build,
  save one version, and prefer an owner-only deployment when it still allows
  the intended reviewer to access it.
- Keep `storybook-static`, copied bundles, preview manifests, Sites project
  metadata, and hosting result files out of the application branch. Use ignored
  or temporary storage for generated deployment input.
- Treat every deployed Sites URL as production. If the user asks only for a
  reviewable candidate, save a version without deploying it.
- Add the full Storybook manager URL and direct story URL to the issue and PR,
  along with the exact source commit and explicit approval gate.

If Sites is unavailable, keep the pushed Storybook branch and stable local URL
as the fallback; do not weaken the design gate.
