# Release Delta QA Matrix

Use one row per visually or functionally testable state. The primary rows are
Release simulator scenes with an explicit device and orientation; supporting
automation may use separate rows. Keep release-only and documentation-only work
in the inventory but out of the interaction matrix.

| ID | Surface/state | Final visual or behavior contract | Simulator/device | Orientation | Storybook or design reference | Supporting automation | Priority | Result | Classification | Screenshot, observation, or disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VIS-01 | Practice Home |  | iPhone 17-Detox | portrait |  |  |  | pending | pending |  |

Allowed results:

- `pass`: observed behavior matches the current final contract.
- `fail`: reproducible mismatch; record an issue after primary-agent review.
- `blocked`: environment, account, hardware, or fixture prevented a meaningful
  check.
- `not-applicable`: the row does not apply to the selected platform or build.

A visual row is `pass` only after a person or visual agent opens the PNG and
records what was inspected. A successful capture command or green component
test is not sufficient. The file's pixel dimensions or observed app frame must
also match the claimed orientation; a filename containing `landscape` is not
orientation evidence.

Classify every failure before acting:

- `product`: preserve evidence and file an issue without fixing the product.
- `validation-drift`: preserve the original failure, narrowly repair the stale
  test, fixture, or workflow, then record the passing rerun.
- `environment`: record the blocked gate; do not weaken validation.

## Finding Draft

```markdown
## Release-delta QA finding

- Baseline: `<release tag>` at `<40-character commit>`
- Target: `<40-character commit>` / tree `<40-character tree>`
- Build: `<command and app path>`
- Environment: `<simulator or device, OS, Xcode>`
- Matrix row: `<QA-ID>`

### Reproduction

1. ...

### Expected

...

### Actual

...

### Impact and frequency

...

### Evidence

...

### Acceptance

- [ ] ...

### Validation scope

...
```

## Grouping Test

Group findings only when every answer is yes:

1. Do they affect the same product journey or cross-cutting boundary?
2. Do they plausibly share one root cause and one implementation change?
3. Can one acceptance checklist close all symptoms?
4. Do they have the same priority, owner, and validation scope?

Otherwise file separate issues and link them as related.
