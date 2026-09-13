# New-Issue Triage

Use this workflow to turn new GitHub issues and user feedback into a
decision-ready backlog. The repo-local execution guide is
`.codex/skills/chessticize-issue-triage/SKILL.md`.

Triage evaluates and routes work. It does not begin product implementation.
Storybook previews created during requested design work are design
artifacts under `docs/agents/ui-flow-design.md`, not production wiring.
For any UI/UX or functional ticket with a presentation change, use that flow
from the existing product-clone story and preserve its stable Storybook URL.

## 1. Establish Scope And Authority

First identify both the issue set and the allowed writes:

- A review, evaluation, or report is read-only unless the request also asks for
  labels, comments, branches, or PRs.
- Tracker triage may update labels and comments when requested, but it does not
  implicitly authorize closing issues or marking them `wontfix`.
- Relationship suggestions are advisory during triage. Shared implementation
  follows the PR workflow; it does not silently consolidate or close tickets.
- A request to create a Storybook design authorizes its issue branch, PR, and
  GitHub Actions-managed Vercel preview. Triage-only requests remain read-only.
- A design-only request does not authorize product implementation. When
  implementation is requested, follow the incremental UI flow contract; final
  user design approval is not a default prerequisite.

For a complete feedback batch, list the requested `user-feedback` issues and
cross-check recently created issues for an omitted label. State the final issue
count and number range so the inventory is auditable.

Before any label-dependent write, run the live preflight in
`docs/agents/triage-labels.md`.

## 2. Read Evidence Before Rating

For every issue, inspect:

- Title, body, labels, comments, attachments, and linked issues or PRs.
- Whether it describes observed behavior, a desired outcome, or a proposed
  solution.
- Existing product behavior and any prior fix or overlapping issue.
- Boundaries touched: UI, domain rules, storage, sync, native services,
  migration, analytics, release, or external accounts.
- Missing reproduction facts, product decisions, privacy constraints, and
  owner-only validation.

Do not treat a reporter’s proposed solution as the only valid solution. Preserve
their actual problem and evidence in the triage rationale.

## 3. Categorize

Choose one primary category and add a narrower product area when useful:

- **Bug or regression:** existing behavior is incorrect or unreliable.
- **Performance or reliability:** latency, dropped input, crashes, or degraded
  core interaction.
- **Functional feature:** a new capability or workflow.
- **UI or UX:** information hierarchy, interaction, accessibility, or visual
  feedback.
- **Support or integration:** external links, feedback, accounts, or services.
- **Research or strategy:** the solution depends on data, policy, or a product
  model that does not yet exist.
- **Documentation or tooling:** repository/process work without product
  behavior changes.

Apply `bug`, `enhancement`, `documentation`, and `user-feedback` only according
to their meanings in `docs/agents/triage-labels.md`.

## 4. Rate Priority

Priority is based on user impact, frequency, severity, workaround quality,
dependency order, and confidence—not implementation size.

| Priority | Meaning |
| --- | --- |
| **P0 — investigate now** | Core-loop failure, data loss, security/privacy risk, crash, or input unreliability that can change outcomes. Diagnosis may be the next action even when implementation is not authorized. |
| **P1 — next** | User-visible correctness problem, blocked journey, important support gap, or prerequisite for other planned work. |
| **P2 — planned** | Meaningful improvement with a viable workaround or no immediate correctness risk. |
| **P3 — later / strategic** | Broad personalization, research-heavy capability, low-frequency improvement, or work that needs more product/data maturity. |

Record priority in the triage comment and report. The repository does not
currently define priority labels, so do not invent or apply them. If priority
labels are added later, document their exact names in
`docs/agents/triage-labels.md` and live-preflight them before use.

Record dependencies that change ordering. For example, trustworthy timeout
attempt data should precede filters or coaching derived from that data.

## 5. Estimate Complete Effort

Use implementation effort—not Storybook prototype effort:

| Band | Typical size |
| --- | --- |
| **S** | About 0.5–2 engineering days |
| **M** | About 3–5 engineering days |
| **L** | About 1–2 engineering weeks |
| **XL** | About 2–4+ engineering weeks; split or research before scheduling |

Include the full boundary: tests, migrations, native/device validation,
cross-platform work, assets, accessibility, and rollout where applicable. Add
`high uncertainty` when reproduction, native diagnosis, data policy, or product
decisions could materially move the estimate.

## 6. Select The Next Tracker State

- `needs-info`: reporter or owner information is required.
- `needs-triage`: product or engineering decisions remain.
- `ready-for-agent`: acceptance criteria, dependencies, and validation boundary
  are explicit and no owner-only decision blocks autonomous work.
- `ready-for-human`: implementation or validation requires sustained human
  judgment, credentials, hardware, or account access.
- `wontfix`: use only after an explicit maintainer decision.

A UI issue may be ready for an agent when its intended outcome and a usable
increment are clear. Wait only for a material missing decision or an explicit
user request to approve design first.

## 7. Relate Issues

Keep each issue's acceptance and status traceable. Related issues with a shared
root cause or implementation boundary may share a PR during authorized work.
Do not consolidate acceptance criteria or close duplicates without authorization.

## 8. Requested UI Previews

For requested preview work with an actual presentation change, follow
`docs/agents/ui-flow-design.md`: update the existing product-clone story,
validate affected behavior, and publish using `docs/STORYBOOK_DEPLOYMENT.md`.
Pure domain, storage and build work needs no Storybook slice. Native-only
behavior uses reachable presentation states when useful; mark unproven native
behavior rather than pretending browser evidence proves it.

A usable design or implementation increment can merge to `main` after review
and necessary automated checks. Continue feedback with new PRs from `main`.
A Vercel Preview is a review artifact; design-only scope remains design-only.

## 9. Leave A Durable Comment

Use one concise comment per issue:

```markdown
## Triage

- Category: <primary category — product area>
- Priority: **P0|P1|P2|P3 (<meaning>)** — <impact rationale>
- Estimated implementation effort: **S|M|L|XL (<range>)** — <boundary and uncertainty>
- Next state: `<triage-role>` — <why>

Dependencies or missing evidence: <none or explicit list>

Related issues: <none, or links plus shared dependency or implementation boundary>

Relationship review: <none, or related issues and a shared implementation boundary>
```

For a published prototype, add a second comment containing the issue-scoped PR,
branch, full Storybook URL, direct story URL, variant/state parameters, exact
commit, validation result, remaining acceptance, and any explicitly requested
user decision.

## 10. Report The Backlog

Finish with:

- The audited issue count and scope.
- A table sorted by priority, then dependency order.
- Category, effort, and uncertainty for every issue.
- Related issues and shared dependencies.
- Issue-scoped Storybook branches, deployments, and check status, if authorized.
- Missing information, native/owner gates, and the next decision.

Keep local verification distinct from remote CI, and keep completed triage
distinct from completed implementation.
