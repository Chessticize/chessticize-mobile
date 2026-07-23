# History Quick Filter Research

Date: 2026-07-23  
Scope: Storybook-only design for issues #248 and #249

## Decision

Use one consistent faceted-filter rule:

- Values selected inside the same facet use **OR**.
- Different facets combine with **AND**.
- Single-choice facets allow only one value, so no operator needs to be shown.

Slow and Timed out are therefore not a special exception. They are the two
values of the **Timing** facet. The existing Theme facet already follows the
same within-facet OR rule.

## Existing Baseline

The current History clone renders five visually equal switch-style quick
controls in one horizontal row: Unclear only, Slow, Timed out, Wrong only, and
Sprint only. Only Slow and Timed out are evaluated together as an OR group;
the visual treatment does not reveal that grouping.

The existing active-filter strip also omits Slow and Timed out, so after the
quick controls scroll out of view there is no persistent timing-state summary.

This is slightly out of alignment with the existing mobile design direction:
History filters should be horizontally scrollable **chips**, and the result
list should remain the primary content on phones
([local mobile UI design](./MOBILE_UI_DESIGN.md#history)).

## Primary-source Findings

- The UK Department for Work and Pensions filter research describes the
  expected faceted model directly: separate criteria such as Date and Payment
  status combine with AND, while selecting Paid and Missed inside Payment
  status expands the matching records, which is OR
  ([DWP Design System](https://design-system.dwp.gov.uk/contribute/filters/summary#adding-more-filters-should-reduce-the-number-of-results)).
- The same DWP research recommends clear applied state near the results:
  result count, applied filters expressed as category plus value, and a reset
  action. This lets people understand the result set even when the controls
  have scrolled out of view
  ([DWP filter state](https://design-system.dwp.gov.uk/contribute/filters/design-notes#state)).
- Material defines filter chips as compact controls for refining content and
  says chips should appear in labelled sets. A selected filter chip can add a
  checkmark as well as changing its container, avoiding reliance on color alone
  ([Material Web chips](https://material-web.dev/components/chip/),
  [Android filter-chip guidance](https://developer.android.com/develop/ui/compose/quick-guides/content/create-chip#create-filter-chip)).
- GOV.UK uses a grouped checkbox set for multiple selections and warns not to
  assume that visual appearance alone tells people how many choices are
  allowed
  ([GOV.UK checkboxes](https://design-system.service.gov.uk/components/checkboxes/)).
- WAI-ARIA requires a logical checkbox group to have a group label and each
  option to expose its checked state. The equivalent React Native presentation
  should expose a labelled Timing group and selected state for each chip
  ([WAI-ARIA checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/)).

## Recommended Incremental Design

Keep the existing horizontal quick-filter row, but replace switch tracks with
compact filter chips and make facet boundaries visible in the same row:

```text
[Unclear]   |   Timing  [Slow] [Timed out]   [Wrong]  [Sprint]
```

- Keep `Timing` and its two chips in one non-breaking horizontal group.
- Keep the Timing group immediately after Unclear, preserving the existing
  quick-filter order and making the new values visible before the rail scrolls
  on typical phone widths.
- Use a short label plus a slightly larger inter-group gap or subtle divider;
  do not add a new card, explanatory sentence, or second row.
- Slow and Timed out remain independently selectable. Selecting the second
  timing value may increase the result count, naturally reinforcing OR.
- A selected chip uses fill plus a checkmark, not a miniature settings switch
  and not color alone.
- Preserve a 44-point touch target around a visually compact 32-36-point chip,
  matching the repository's phone target guidance.
- Keep the existing live result count and active-filter strip. Summarize timing
  as one category-bearing token:
  - `Timing: Slow`
  - `Timing: Timed out`
  - `Timing: Slow or timed out`
- Prefix other applied tokens by facet where ambiguity is possible, for
  example `Result: Wrong` and `Source: Sprint`. Separate applied tokens are
  cumulative constraints; the word `or` appears only inside the Timing token.
- Expose the Timing set to assistive technology as a labelled multi-select
  group. Each chip should announce selected/not selected.

This communicates the logic through grouping and current state, without a
formula such as `Slow OR Timed out AND Wrong`, which adds noise and creates
operator-precedence questions.

## Alternatives

### One aggregate Timing chip

Show `Timing`, `Timing: Slow`, or `Timing (2)` in the quick row and open a small
menu or sheet containing Slow and Timed out.

- Advantage: smallest persistent footprint and scales to more timing values.
- Cost: the most common timing filter becomes a two-tap action and introduces
  a new transient surface.
- Use later if the quick row grows beyond the current phone-friendly scope.

### Flat peer chips with an explicit logic summary

Keep Slow and Timed out as ungrouped peers and render a summary such as
`Slow OR Timed out AND Wrong`.

- Advantage: mathematically explicit.
- Cost: visually noisy, harder to localize, and ambiguous without parentheses.
- Not recommended for a training-first mobile UI.

### Joined segmented control

Join Slow and Timed out into a conventional platform segmented control.

- Advantage: strong visual grouping.
- Cost: on iOS, segmented controls normally communicate one selection at a
  time, so the component can incorrectly suggest mutual exclusion
  ([Apple segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)).
- Use a labelled filter-chip set instead.

## Storybook Acceptance Checks

- With Slow selected, only slow attempts remain.
- Selecting Timed out as well keeps both slow and timed-out attempts and can
  increase the result count.
- Selecting Wrong or Sprint additionally narrows that timing union.
- The applied-state strip renders one Timing token, not two unrelated tokens.
- At 320-point width, the row scrolls horizontally, each target remains
  tappable, and the first result remains visible without new vertical chrome.
- Screen readers announce a Timing multi-select group and each chip's selected
  state.
