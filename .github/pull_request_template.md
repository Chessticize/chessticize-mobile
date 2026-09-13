## Summary

- <!-- Describe the coherent goal and user/developer impact. -->

## Increment And Follow-up

Describe the usable increment being integrated into `main`, remaining polish or
user/device acceptance, and linked issues. Final user approval is required only
when explicitly requested; subsequent feedback continues in new PRs.

For UI changes, link the updated story and hosted preview when a handoff is in
scope. Omit UI fields for unrelated work. See `docs/agents/ui-flow-design.md`.

## Validation

- Changed behavior and necessary automated checks:
- Results and reused evidence (tested source, affected diff, reuse rationale):
- Native scope and identity, only when uncovered native risk requires execution:
- Known limitations or follow-up acceptance:

Do not duplicate CI locally or require all tests on the latest SHA. Artifact
reuse and test-evidence reuse follow `docs/TESTING_ARCHITECTURE.md` separately.

## Review mode

Select one. Incremental is the default after an accepted review baseline exists;
full means the complete coherent PR change set, not the entire repository.

- [ ] Incremental review
- [ ] Full review

Review checkpoint (update in the PR body or append a new PR comment after review):

```text
Review-Mode: incremental|full
Review-Baseline: <40-character commit SHA>
Reviewed-Through: <40-character commit SHA>
Review-Result: pending|findings|pass
```

For the first full review, use the PR merge base as `Review-Baseline`. For an
incremental review, use the prior passing `Reviewed-Through`.

Rationale or full-review trigger:

## Distribution (when in scope)

Dev or Production TestFlight may follow automated acceptance without waiting
for final device feedback. Public Production release retains the owner's final
go/no-go. Record the actual source/build identity, processing state and remaining
acceptance separately. RC records apply only to formal stabilization, not
ordinary `main` iteration.
