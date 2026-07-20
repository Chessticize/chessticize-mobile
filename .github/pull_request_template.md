## Summary

- <!-- Describe the coherent goal and user/developer impact. -->

## UI flow design gate

Select exactly one. For a new UI flow, the Storybook design slice and explicit
approval must predate production wiring. See `docs/agents/ui-flow-design.md`.

- [ ] Not a new UI flow
- [ ] Storybook-first design approved before product wiring

Storybook URL:

Design approval record:

## Validation scope

Select exactly one native-validation scope and explain why it proves the changed boundary.

- [ ] No mobile Detox
- [ ] Targeted `flows` spec or suite
- [ ] Targeted `practice` spec or suite
- [ ] Full `flows` and `practice`
- [ ] Focused simulator screenshot only

Rationale:

## Validation

- [ ] Relevant focused regression test
- [ ] Required path-scoped CI checks
- [ ] Exact-head native evidence recorded when targeted or full validation is selected

Commands and results:

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

## Release follow-up

Check any conditional release gates created or changed by this PR.

- [ ] None
- [ ] Native schema upgrade smoke
- [ ] Signed CloudKit staging/manual validation
- [ ] Physical-device notification or interaction smoke
- [ ] TestFlight upgrade or App Store screenshot validation

Notes:
