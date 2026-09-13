# Incremental UI Design And Integration

`main` is the product integration hub. A coherent, usable UI increment can merge
after Astra's review and necessary automated checks, before final user review.
The user tests one integrated binary and supplies feedback; continue that work
in small PRs from current `main`. Do not require a whole feature to be polished
or finally approved before its first useful increment is integrated.

## Select The Requested Scope

- **Implementation requested:** build a usable increment, including real product
  wiring and appropriate tests. Keep its existing product-clone story current.
  No separate design-only PR or explicit design approval is required by default.
- **Design or preview only:** produce the requested Storybook artifact without
  inferring product implementation permission. The finished design increment
  may merge under `docs/agents/pr-workflow.md`; later wiring requires an
  implementation request, not an extra approval ceremony.
- **User explicitly asks to review before implementation or merge:** respect
  that boundary. Prepare the concrete preview first, then obtain the requested
  decision. Reuse decisions already recorded in the task, issue, or PR.
- Ask about an unresolved consequential product choice only when it prevents a
  reasonable usable increment; continue independent work while it is pending.

Small copy, spacing, accessibility, error recovery, and bug fixes use the
cheapest proving layer. A new action or state alone does not force a separate
approval phase. Known crashes, data loss, or broken core journeys are not a
usable increment; report non-blocking polish and remaining acceptance honestly.

## Maintain The Product Presentation

Use production-intended React Native components, typed view data and maintained
fixtures such as `PracticeService` or `MemoryStore`. Update an existing story
incrementally and preserve its stable Storybook URL. Add a scenario only for a
new product destination or materially distinct state. Avoid parallel mockup UI.
Cover the entry, primary action and outcome, plus relevant failure/recovery
states. Pure core, storage and build changes need no Storybook design slice.
Synchronize first-use guidance only when the behavior it teaches changes.

Keep each linked issue's acceptance and status separate. One coherent increment
may address related issues sharing a root cause or implementation boundary.
Use the issue-numbered branch convention for a single-issue design preview;
ordinary implementation follows the feature PR convention.

For a new design track, reset `newScenarioMarkers.json` and add its current
issue marker(s) with `issueNumber` and `changeNote`; keep scenarios themselves.
Same-track follow-ups update their markers. The existing marker validator owns
the manifest format and reset check; do not rewrite it merely for an iteration.

## Validate And Hand Off

Run focused component tests and headless `pnpm mobile:lab:validate` when Lab
inputs change. Native checks are selected by `docs/TESTING_ARCHITECTURE.md`, not
by whether the UI has received final user acceptance.

A requested Storybook handoff includes the branch, PR and hosted preview unless
the user gives a narrower scope. Follow `docs/STORYBOOK_DEPLOYMENT.md` for the
GitHub Actions-managed branch Vercel preview, source identity and public access.
Reuse the workflow's source/access checks and inspect the affected interactions.
Do not require a fresh deployment for unrelated documentation changes.
Do not commit generated Storybook bundles or private screenshots.

A preview outage blocks a requested hosted handoff, not an otherwise validated
implementation PR or TestFlight delivery. Record the missing preview, continue
with available component/native evidence, and retry publication when useful.
Never overwrite another branch's deployment or create a replacement hosting
project to conceal the outage.

Merge a usable increment under `docs/agents/pr-workflow.md`. Deliver Dev or
Production TestFlight when in scope; final device feedback and design polish
continue through new PRs. Formal public Production release follows
`docs/RELEASE_SOURCE_POLICY.md` and retains the owner's final decision.
