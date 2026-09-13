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
- Reuse review and validation by affected boundary under
  `docs/TESTING_ARCHITECTURE.md`. Required CI must be green, but do not repeat
  its checks locally or rerun unaffected suites merely for a new SHA. Record
  remaining risks and the focused evidence that covers the latest increment.

## Feature Branches And Completion

Use one feature-scoped branch and PR per usable increment from current `main`.
Keep related follow-ups in that PR until it merges; subsequent feedback uses a
new PR from `main`. Multiple issues with a shared root cause or implementation
boundary may share a PR while retaining individual acceptance and status.

Astra may mark the increment ready and merge when it is usable, reviewed, and
its necessary automated checks pass. Final user review, device testing, and
non-blocking polish need not be finished. Record remaining acceptance and follow-up
work; do not close an issue whose requested outcome is still incomplete.
Design-only requests remain design-only unless implementation is authorized.

Pushes and merging these increments are authorized. Check actual required CI
with `gh pr checks`; reuse completed local evidence by risk. Missing branch
protection is not a blocker or proof of success. Do not merge failed required
checks or known faults that make the increment unusable. Use
`gh pr merge --squash --delete-branch` for feature and contributor PRs.

`main` is the integration hub for one binary containing the latest features.
Dev and Production TestFlight uploads may proceed without final user approval
or device acceptance when delivery is in scope. They do not authorize formal
public Production release; follow the release policy for that final decision.

For coordinated releases, read [Release Source Policy](../RELEASE_SOURCE_POLICY.md)
and [Release Versioning](../RELEASE_VERSIONING.md) before changing any branch or
candidate. They own integration branches, contributor PR targets, append-only
history, RC freeze/remediation, exact source/artifact identities, and submission
gates. The final release PR to main is the sole merge-commit exception; never
apply the ordinary squash workflow to it.
