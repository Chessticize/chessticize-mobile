---
name: chessticize-issue-triage
description: Classify and prioritize Chessticize GitHub issues or a requested feedback batch. Use for tracker triage, issue readiness, and explicitly requested issue-linked Storybook previews; not generic estimates or ordinary implementation.
---

# Chessticize Issue Triage

Evaluate the requested issue set without inferring product implementation.
For read-only evaluation, read the relevant rubric sections in
`docs/agents/issue-triage.md`. Read `docs/agents/issue-tracker.md` only for GitHub
operations; read `docs/agents/triage-labels.md` and query live labels only before
using labels. Reuse that query within a batch unless label state changes.
A missing label blocks that label operation, not the analysis or an otherwise
authorized issue/comment write.

## Workflow

1. Inventory the requested issue numbers or batch, including unlabeled feedback
   when completeness is requested. Inspect bodies, comments and relevant behavior.
2. Apply the rubric's category, priority, effort and next-state criteria. Mark
   high uncertainty and estimate only boundaries actually affected; do not invent
   priority labels. Distinguish reported fact, desired behavior and inference.
3. Relationship suggestions are advisory during triage. During authorized
   implementation, related issues may share a PR under the PR workflow. Do not
   consolidate or close tickets merely because their implementation is shared.
4. Keep review/report requests read-only. For authorized tracker updates, leave
   one concise durable triage comment and apply the requested labels. Preserve
   each issue's acceptance and closure decision.
5. For requested Storybook work with a real presentation change, use
   `docs/agents/ui-flow-design.md` and the existing product-clone story.
   A single-issue preview can use `codex/storybook-issue-<number>-<goal>`.
   Pure core, storage and build issues need no design slice. Only read the
   deployment contract when publishing a requested preview.
6. Report the inventory, priorities, uncertainties and next actions. A usable
   increment may merge to `main`; final user acceptance can follow there through
   new PRs. An explicit design-only request does not authorize product wiring.

Do not add user approval gates beyond the current request and the owning
contracts. Triage completion does not imply implementation or issue closure.
