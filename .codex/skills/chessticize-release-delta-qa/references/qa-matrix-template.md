# Release Delta QA Matrix

Use one row per visually or functionally testable state. The primary rows are
Release simulator scenes with an explicit device and orientation; supporting
automation may use separate rows. Keep release-only and documentation-only work
in the inventory but out of the interaction matrix.

Keep full-screen iPhone simulator rows in portrait. Use iPad rows for native
landscape and resizable-window evidence, and add component or Interaction Lab
rows for compact wide-short and foldable-sized viewports.

| ID | Surface/state | Final visual or behavior contract | Simulator/device | Orientation | Storybook or design reference | Supporting automation | Priority | Functional result | Copy result | Presentation result | Classification | Screenshot, observation, or disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VIS-01 | Practice Home |  | iPhone 17-Detox | portrait |  |  |  | pending | pending | pending | pending |  |

Allowed results:

- `pass`: observed behavior matches the current final contract.
- `fail`: reproducible mismatch; record an issue after primary-agent review.
- `blocked`: environment, account, hardware, or fixture prevented a meaningful
  check.
- `not-applicable`: the row does not apply to the selected platform or build.

A visual row is complete only after a person or visual agent opens the PNG and
records both judgments:

- `Functional result`: interaction state, content, reachability, clipping, and
  expected behavior.
- `Copy result`: novice clarity, accuracy, grammar, concision, tone, product
  terminology, and consistency with the visible control and behavior.
- `Presentation result`: hierarchy, alignment, spacing rhythm, typography,
  whitespace balance, density, consistency, and overall polish.

A successful capture command or green component test is not sufficient. The
file's pixel dimensions or observed app frame must also match the claimed
orientation; a filename containing `landscape` is not orientation evidence.
Record the exact visible defect and its effect on comprehension, scanability,
balance, consistency, or trust. Do not fail a row for taste alone without an
observable rationale.

Evaluate text as a first-time user who can only see the current UI. Text fails
when it is misleading, ambiguous, awkward, repetitive, inconsistent, overly
internal, or does not explain the visible element or consequence. Fully visible
text is not automatically good copy.

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

### Copy impact

Describe any clarity, accuracy, grammar, terminology, tone, repetition, or
novice-comprehension problem. Write `None` when the copy passes.

### Presentation impact

Describe any hierarchy, alignment, spacing, typography, balance, consistency,
or polish problem and how it affects the user. Write `None` for a purely
functional finding.

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
