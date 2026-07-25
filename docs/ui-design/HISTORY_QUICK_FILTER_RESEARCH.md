# History Quick Filter Research

Date: 2026-07-24
Scope: Issues #248 and #249

## Decision

Use one persistent, single-select segmented control:

```text
[ Needs attention ] [ All ]
```

- Default to `Needs attention`.
- Define `Needs attention` by current user-managed state: `Unclear OR in
  Review`.
- Default the advanced Source facet to `All sources`.
- Keep range, Run/rating bucket, source, result, Attention, side, and theme
  controls in the existing filter menu.
- Expose `Unclear` and `In review` as the two Attention reasons. Combine them
  with OR; both are selected when the user enters `Needs attention`.
- Remove the separate Review queue facet. Active Review membership is represented
  by the `In review` Attention reason instead.
- Keep the full Themes catalog collapsed when the menu opens. Its disclosure
  names selected themes in one ellipsized line. The applied summary below the
  view selector shows one theme name or `{n} themes selected`.
- Keep all advanced filters inside one bordered region above the view selector.
  Themes remains a lightweight disclosure subsection rather than a nested card.
- Keep no second quick filter. The filter button, result count, and compact
  applied-filter summary already communicate the rest of the state.

This supersedes both the earlier separate Slow/Timed out quick-chip proposal
and the four-value Attention proposal. The retained Attention group contains
only `Unclear` and `In review`.

## Behavior

- A Slow correct attempt is automatically marked Unclear.
- A Timed out attempt counts as a Sprint mistake and is automatically marked
  Unclear. It keeps its distinct `Timed out` History result and label.
- The `Wrong` result filter includes both submitted wrong moves and Timed out
  attempts.
- The app does not ask whether a Slow attempt was unclear after it has already
  set that marker. It shows a non-actionable notice explaining that the attempt
  was marked Unclear because it was Slow.
- Slow and Timed out remain visible History labels, not filtering reasons.
- Any attempt represented by an active Review Schedule qualifies through
  `In review`, including a clean correct attempt enrolled manually.
- Selecting either Attention reason keeps the primary selector on
  `Needs attention`. Clearing both switches it to `All`; entering
  `Needs attention` from `All` selects both reasons.
- If a user clears Unclear or removes the matching Review entry, the attempt
  leaves `Needs attention` once neither state remains.
- Advanced facets narrow the selected view with AND. Attention reasons and
  multiple selected themes each keep OR behavior inside their own facet.
- Reset restores `Needs attention`, `All sources`, the default seven-day range,
  both Attention reasons, and no other optional advanced filters.

## Why This Control

Apple describes a segmented control as a way to present closely related choices
that affect a view and preserve the current selection at a glance. A toggle
instead represents opposing on/off states. `Needs attention` and `All` are two
named result scopes, so a segmented control makes both meanings visible
([Apple segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls),
[Apple toggles](https://developer.apple.com/design/human-interface-guidelines/toggles)).

Android's official guidance likewise defines a single-select segmented button
as a side-by-side choice with one selected option
([Android Developers](https://developer.android.com/develop/ui/compose/components/segmented-button)).
The presentation uses a labelled radio group for the WAI-ARIA single-selection
contract
([W3C radio group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)).

DWP's filter research recommends AND across different criteria, notes that
multiple values inside one criterion naturally use OR, and recommends visible
result count and applied state
([DWP filter logic](https://design-system.dwp.gov.uk/contribute/filters/summary#adding-more-filters-should-reduce-the-number-of-results),
[DWP filter state](https://design-system.dwp.gov.uk/contribute/filters/design-notes#state)).
It also notes that expanded mobile filters consume the viewport, supporting one
high-value persistent selector
([DWP mobile filter layout](https://design-system.dwp.gov.uk/contribute/filters/design-notes#mobile-views)).

## Storybook Acceptance Checks

- Initial state selects `Needs attention`, `All sources`, `Unclear`, and
  `In review`.
- The segmented order is `Needs attention`, then `All`.
- Needs attention includes an Unclear attempt, a wrong attempt still in Review,
  and a clean correct attempt enrolled manually in Review.
- A Slow or Timed out fixture appears because it is auto-marked Unclear, not
  because of its timing label.
- A normal clear attempt and a wrong attempt removed from Review are excluded.
- The filter menu exposes only `Unclear` and `In review` in its Attention group
  and has no separate Review queue facet.
- Selecting one Attention reason keeps `Needs attention` selected. Clearing
  both switches to `All`; selecting `Needs attention` again restores both.
- Advanced facets only narrow the selected view.
- Themes is collapsed by default, retains a compact selection summary, and
  reveals all curated choices on demand.
- Reset restores `Needs attention` with both Attention reasons selected.
- At 320-point width, both segments and the filter button remain visible
  without horizontal scrolling.
- Assistive technology announces one selected option in a labelled radio group.
