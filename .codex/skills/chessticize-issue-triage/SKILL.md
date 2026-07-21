---
name: chessticize-issue-triage
description: Triage new Chessticize GitHub issues into evidence-backed categories, effort bands, priorities, tracker states, dependencies, and coherent UI design groups. Use when evaluating an issue batch, processing user feedback, deciding what is ready for an agent or human, estimating issue scope, linking related issues, or preparing Storybook-only design previews before implementation.
---

# Chessticize Issue Triage

Produce a decision-ready backlog without beginning product implementation.

## Read The Repository Contracts

Before acting, read:

- `docs/agents/issue-tracker.md` for GitHub operations.
- `docs/agents/triage-labels.md` for exact labels and the live-label preflight.
- `docs/agents/issue-triage.md` for the authoritative evaluation rubric and comment format.
- `docs/agents/ui-flow-design.md` when an issue changes a UI journey.

Treat missing required labels as a tracker setup blocker. Do not substitute a
similar label.

## Respect The Requested Write Scope

- For review or reporting requests, keep GitHub and the repository read-only.
- For triage requests that authorize tracker updates, apply labels and post the
  durable triage comment described in `docs/agents/issue-triage.md`.
- Create branches, Storybook scenarios, or draft PRs only when the request also
  authorizes prototypes or preview publication.
- Never infer authorization to close, mark `wontfix`, or start product
  implementation.

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
5. **Group only coherent work.** Group issues when one user journey, data
   contract, or interaction model solves them better together. Comment on every
   grouped issue with links and the reason. Do not group merely because issues
   touch the same screen or could ship together. Decide design grouping and
   implementation grouping separately: one Storybook contract may cover issues
   whose later native diagnosis or implementation must remain independent.
6. **Prototype authorized UI groups.** For preview-enabled triage, represent
   every UI or functional-feature issue in a Storybook design slice, including
   the reachable presentation states around a native-only boundary. Create one
   Storybook branch and draft PR per coherent design group. When subagents are
   available, delegate independent UI groups to separate subagents; give each
   one branch and prevent overlapping files. Prefer two or three structurally
   distinct directions when a real design choice exists.
7. **Preserve native boundaries.** Storybook can specify perceived response,
   layout, states, and handoff copy. It cannot prove board latency, gestures,
   audio, haptics, native modules, persistence, or device behavior. Record the
   later diagnostic or validation requirement separately.
8. **Publish the record.** Post one concise triage comment per issue. For a
   prototype, add the branch, draft PR, stable Storybook URL, deterministic
   variant/state parameters, validation result, and explicit approval gate.
9. **Hand off by priority.** Report the complete issue count, sorted triage
   matrix, groupings, preview links, blockers, and the next human decision.

## Storybook Preview Gate

For an authorized preview:

- Use `codex/storybook-<coherent-goal>`.
- Keep the PR draft and retain the New Scenario Marker until explicit approval.
- Link every covered issue in the PR and link the PR back from every issue.
- Run `pnpm mobile:lab:validate` plus focused component or type checks required
  by the presentation boundary.
- Inspect affected phone and wide viewports and exercise stable URL state.
- Push the exact reviewed commit and verify the Interaction Lab check.
- Stop after the design handoff. Do not mark the product issue
  `ready-for-agent` for implementation until the design decision and remaining
  acceptance criteria are explicit.

## Completion Standard

Do not call triage complete until every issue in the inventory has a recorded
category, priority, effort, rationale, dependency or grouping decision, and
next state. Make uncertainty and owner-only decisions visible.

## Hosted Preview Handoff

When the request authorizes remote preview publication and Sites is available:

- Update `sites/storybook-previews/preview-manifest.json` with every active
  design group's exact commit, branch, PR, issues, and stable story path.
- Build and sync the pinned Storybooks with `npm run build:with-previews` from
  `sites/storybook-previews`, then run `npm test`.
- Follow the Sites build and hosting skills. Reuse the persisted `project_id`,
  push the exact validated source, package the matching build, save one version,
  and prefer an owner-only deployment.
- Treat every deployed Sites URL as production. If the user asks only for a
  reviewable candidate, save a version without deploying it.
- Add the deployed hub URL to every covered issue and prototype PR while
  retaining the draft status, New Scenario Marker, and explicit approval gate.

If Sites is unavailable, keep the pushed Storybook branch and stable local URL
as the fallback; do not weaken the design gate.
