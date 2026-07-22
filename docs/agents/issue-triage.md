# New-Issue Triage

Use this workflow to turn new GitHub issues and user feedback into a
decision-ready backlog. The repo-local execution guide is
`.codex/skills/chessticize-issue-triage/SKILL.md`.

Triage evaluates and routes work. It does not begin product implementation.
Storybook prototypes created during authorized preview work are design
artifacts under `docs/agents/ui-flow-design.md`, not production wiring.
For any UI/UX or functional ticket with a presentation change, use that flow
from the existing product-clone story and preserve its stable Storybook URL.

## 1. Establish Scope And Authority

First identify both the issue set and the allowed writes:

- A review, evaluation, or report is read-only unless the request also asks for
  labels, comments, branches, or PRs.
- Tracker triage may update labels and comments when requested, but it does not
  implicitly authorize closing issues or marking them `wontfix`.
- Relationship suggestions are advisory. Do not consolidate tickets, close one
  as a duplicate, move its scope, or create a shared handling track without
  explicit human approval for that exact action.
- Prototype publication requires explicit branch or preview authorization.
- Product implementation requires a later explicit request. For a new UI flow,
  it also requires recorded design approval.

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

Do not mark a new UI flow ready for product implementation while its Storybook
design choice is unapproved. The prototype PR may be ready for design review
while the product issue remains in triage.

## 7. Relate Issues Without Consolidating Them

Each feedback issue owns its own Storybook design track, even when several
issues touch the same screen or may later share an implementation. Link related
issues and record shared dependencies, but give each issue its own:

- Issue-numbered Storybook branch and PR history.
- New Scenario Marker ownership.
- Full-Storybook deployment URL.
- Approval record and implementation handoff.

Relationship suggestions are advisory. Triage may suggest that shared handling
could be considered, but it must present that as a question for human review,
not as a grouping decision. Do not consolidate tickets, close one as a
duplicate, combine acceptance criteria, create one Storybook track, or schedule
one implementation track without explicit human approval. Until that approval
is recorded, keep each ticket independently actionable and independently
closable.

## 8. Prototype UI And Functional Feedback

When preview work is explicitly authorized:

1. Represent every UI or functional-feature issue in a Storybook design slice.
   For native-only behavior, show its reachable presentation states and mark
   the unproven native exit explicitly.
   When the affected product screen already exists in the catalog, change that
   existing product-clone story incrementally and preserve its stable URL; do
   not invent a separate page for the feature. The full Storybook should
   represent the expected product after implementation, with `new` highlighting
   the delta.
2. Create a branch named `codex/storybook-issue-<number>-<goal>` for one issue.
3. Add every new or materially changed scenario owned by that issue to
   `newScenarioMarkers.json`. Add its `issueNumber` and concise `changeNote` to
   the scenario's `issues` array without removing any other open issue owner;
   the registry derives `isNew: true` from the non-empty array.
4. Add deterministic variants and important states to the complete Interaction
   Lab catalog.
   Prefer two or three structurally different directions when the decision is
   genuinely open.
5. Validate the Interaction Lab and inspect affected phone and wide viewports.
6. Deploy the full Storybook from the exact reviewed commit and make the
   issue-owned scenarios easy to find through the `new` tag and What's New page.
7. Link the issue, PR, deployment, exact commit, and design rationale in both
   directions.

A design PR may become ready and merge to `main` when its current interaction
increment is coherent and its required checks pass. Merging design artifacts is
not design approval and does not authorize product wiring. Continue later
feedback rounds from current `main`, update the same issue-owned scenarios, and
deploy through the new branch's dedicated site, project, and URL until the
design is approved for implementation.

Each New Scenario Marker ownership remains on `main` for as long as its linked
issue is open. Remove only that ownership in a cleanup change after GitHub
records the issue as closed; remove the marker only when no ownership remains.
Pull-request CI verifies every removed ownership. Retain the scenario itself as
living UI documentation.

The Storybook phase must not add production navigation, persistent storage or
backend mutation, native-module wiring, analytics, rollout, or release logic.
It cannot prove native latency, gestures, sound, haptics, or device behavior;
record those as later diagnostic or validation work.

### Hosted preview handoff

When remote preview publication is authorized and Sites is available, build and
deploy the complete `apps/mobile-lab` Storybook from the reviewed branch's exact
commit through a Sites project dedicated to that branch. Reuse the site only for
later commits on the same branch; a new branch gets a new project and URL, even
for the same issue. Stop if the recorded source branch or commit does not match
the reviewed application branch. Every Storybook review site, including the
main-branch catalog and every branch-owned site, is public and must not require
authentication. Set Sites access mode to public and verify that an
unauthenticated request to `/storybook/` returns HTTP 200 before handoff.

Do not commit `storybook-static`, copied bundles, a preview manifest, or hosting
result files to the application branch. Generate deployment input in ignored or
temporary storage and keep the source commit as the identity recorded in the
issue and PR. A hosted preview does not approve a design or begin product
implementation. Every Sites deployment URL is production; save without
deploying when the request authorizes only a reviewable candidate.

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

Relationship review: <none, or advisory suggestion requiring explicit human approval before consolidation or shared handling>
```

For a published prototype, add a second comment containing the issue-scoped PR,
branch, full Storybook URL, direct story URL, variant/state parameters, exact
commit, validation result, excluded production boundaries, and explicit
approval gate.

## 10. Report The Backlog

Finish with:

- The audited issue count and scope.
- A table sorted by priority, then dependency order.
- Category, effort, and uncertainty for every issue.
- Related-issue suggestions and shared dependencies awaiting human review.
- Issue-scoped Storybook branches, deployments, and check status, if authorized.
- Missing information, native/owner gates, and the next decision.

Keep local verification distinct from remote CI, and keep completed triage
distinct from unapproved implementation.
