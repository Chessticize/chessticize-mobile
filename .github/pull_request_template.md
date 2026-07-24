## Summary

- <!-- Describe the coherent goal and user/developer impact. -->

## UI flow design gate

Select exactly one. For a new UI flow, the Storybook design slice and explicit
approval must predate production wiring. See `docs/agents/ui-flow-design.md`.

- [ ] Not a new UI flow
- [ ] Storybook-only design increment; no product wiring
- [ ] Storybook-first design approved before product wiring

Linked UI issue:

Storybook source branch:

Full Storybook manager URL:

Direct story URL:

Storybook source commit:

Storybook anonymous access verification (the site is public and must not require authentication):

New Scenario Marker lifecycle (select one):

- [ ] Not applicable
- [ ] Added or retained for an open linked issue
- [ ] Removed after the linked issue was closed

Design approval record:

## Validation scope

Native validation is required only for releases and native-impacting changes.
Select exactly one scope and explain why the change does or does not cross that
boundary.

- [ ] No mobile Detox
- [ ] Targeted `flows` spec or suite
- [ ] Targeted `practice` spec or suite
- [ ] Full `flows` and `practice`
- [ ] Optional focused simulator screenshot only

Rationale:

## Validation

- [ ] Relevant focused regression test
- [ ] Required path-scoped CI checks
- [ ] Native evidence recorded when targeted/full is selected, or reuse documented with unchanged validation-relevant development inputs

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
