# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all
operations and follow the repository's GitHub CLI escalation rules.

For new-issue evaluation, priority and effort ratings, tracker routing,
coherent UI grouping, and optional Storybook preview handoff, follow
`docs/agents/issue-triage.md` and use the repo-local
`chessticize-issue-triage` skill.

For a UI/UX or functional ticket with a presentation change, route triage
through `docs/agents/ui-flow-design.md`. Start with the existing product-clone
story and preserve each issue's design ownership.

Before any label-dependent write, run the live tracker preflight in
`docs/agents/triage-labels.md`. A missing required label is a tracker setup
blocker; do not silently substitute a similar stock label.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,state,labels,comments --jq '{number, title, body, state, labels: [.labels[].name], comments: [.comments[].body]}'`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Ticket Relationships And Consolidation

Relationship suggestions are advisory. Triage may note that tickets appear
related and explain the shared journey, contract, or dependency, but must not
turn that suggestion into shared handling.

Do not consolidate tickets, close one as a duplicate, transfer its acceptance
criteria, convert the relationship into a parent/child consolidation, or place
multiple tickets on one design or implementation track without explicit human
approval for that exact action. Until approval is recorded, every ticket keeps
its own state, scope, comments, approval record, and closure decision.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Use the structured **Read an issue** command above so the ticket body, labels,
and comments are all available to the workflow.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue using the map label defined in
  `docs/agents/triage-labels.md`, holding the Notes / Decisions-so-far / Fog
  body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api`
  on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to
  a task list in the map body and put `Part of #<map>` at the top of the child
  body. Use the Wayfinder type labels defined in
  `docs/agents/triage-labels.md`. Once claimed, the ticket is assigned to the
  driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
