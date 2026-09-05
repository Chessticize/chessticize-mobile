# PR Workflow And Review

## Review Cadence

- The first review of a coherent PR establishes an accepted review baseline for
  that PR's complete change set. After that baseline exists, prefer incremental
  review of the diff from the last reviewed commit to the current head, its
  directly affected contracts, and any unresolved findings. Do not restart a
  full review solely because a small follow-up commit, comment edit, or CI retry
  changed the head SHA.
- A successful review must leave a durable checkpoint in the PR body or a new
  PR comment with `Review-Mode`, `Review-Baseline`, `Reviewed-Through`, and
  `Review-Result: pass`, using full 40-character commit SHAs. The next reviewer
  uses the latest passing `Reviewed-Through` commit only after verifying that it
  is an ancestor of the current head, then reviews
  `Reviewed-Through..current-head`. For the first full PR review,
  `Review-Baseline` is the PR merge base; for an incremental review, it is the
  prior passing `Reviewed-Through`. A missing, ambiguous, or non-passing
  checkpoint is not reusable. A non-ancestor checkpoint may be re-anchored only
  after `git range-diff` or equivalent evidence proves the reviewed change set
  is patch-equivalent; otherwise use full review. A release review may reuse the
  exact commit's accepted PR checkpoint and add only the release-identity and
  evidence audit.
- Full review means reviewing the coherent PR or release change set again, not
  reviewing the entire repository. Trigger it only when there is no trustworthy
  accepted baseline; the stated goal, specification, or architecture boundary
  materially changes; the change selects **Full native validation**; signing,
  source/artifact identity, privacy/security, schema/migration, global launch or
  test infrastructure changes; a serious finding invalidates earlier review
  assumptions; or accumulated follow-ups can no longer be bounded to the
  previously reviewed behavior.
- Diff size alone does not choose the mode. Documentation, copy, styling,
  test-only corrections, and focused fixes remain incremental unless their
  semantic impact meets a full-review trigger. A small native, persistence,
  signing, privacy, or release-identity change may still require full review.
- Review reuse does not reuse stale validation evidence. Required fast checks
  must pass on the current head. Native App evidence remains reusable only
  while the fail-closed App-input digest is unchanged. A test-runner change
  invalidates and reruns only the affected test evidence; documentation,
  review metadata, and merge-parent changes alone invalidate neither.

## Feature Branches And Completion

Use one feature-scoped branch and PR per coherent goal; push related follow-ups
to that PR. Use a draft while the stated goal is incomplete, and mark it ready
proactively once the goal and selected local validation are complete. A
Storybook-only increment may complete while product wiring remains out of scope
and its issue remains open.

Draft PRs receive the applicable path-scoped checks; ready PRs also receive
Mobile JS checks when their paths apply. Pushes to open PR branches are
authorized. Merge a complete, reviewed, ready PR after checking its actual
required CI results and required local evidence with `gh pr checks` and the PR
record. Missing branch protection is not a blocker or evidence of success. Do
not merge an unfinished goal, red required check, incomplete selected native
scope, or unresolved product issue in the stated goal. Use
`gh pr merge --squash --delete-branch` for feature and contributor PRs, and
delete or reuse stale `codex/*` feature branches after merge.

For coordinated releases, read [Release Source Policy](../RELEASE_SOURCE_POLICY.md)
and [Release Versioning](../RELEASE_VERSIONING.md) before changing any branch or
candidate. They own integration branches, contributor PR targets, append-only
history, RC freeze/remediation, exact source/artifact identities, and submission
gates. The final release PR to main is the sole merge-commit exception; never
apply the ordinary squash workflow to it.
