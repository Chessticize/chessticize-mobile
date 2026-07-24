# History Quick Filter Research

Date: 2026-07-24
Scope: Storybook-only design for issues #248 and #249

## Decision

Use one persistent, single-select segmented control:

```text
[ All ] [ Needs attention ]
```

- Default to `All`.
- Define `Needs attention` as `Slow OR Wrong OR Unclear OR Timed out`.
- Default the advanced Source facet to `All sources`.
- Move range, Run/rating bucket, source, result, Review queue, side, attention
  flags, and theme controls into the existing filter menu.
- Let `Mistakes`, `Unclear`, `Slow`, and `Timed out` be independently
  selectable `Attention flags`. Multiple selected flags use OR. `Mistakes`
  intentionally overlaps `Result: Wrong` so that every reason behind
  `Needs attention` can be composed inside one group; keep Result as the
  independent `Correct / Wrong` dimension.
- Label Review membership `Review queue: All / In queue / Not in queue`.
- Keep the full Themes catalog collapsed when the menu opens. Its disclosure
  summary names the selected themes in one ellipsized line. Keep the applied
  filter summary below the view selector compact: show the theme name for one
  selection or `{n} themes selected` for multiple selections.
- When expanded, present all advanced filters inside one bordered region above
  `All / Needs attention`. Themes remains a plain disclosure subsection inside
  that region rather than a second full-width card.
- Keep the filter-menu button, result count, and compact applied-filter
  summary. They communicate state; they are not additional quick filters.
- Keep no second quick filter in this iteration. Date range is the only
  plausible future candidate, and should return only if usage evidence shows
  that people repeatedly change it.

This supersedes the earlier recommendation for separate `Slow` and `Timed out`
quick chips. It remains an incremental change to the existing History clone.

## Why This Control

Apple describes a segmented control as a way to present closely related choices
that affect a view and preserve the current selection at a glance. A toggle
instead represents opposing on/off states. `All` and `Needs attention` are two
named result scopes, so a segmented control makes both meanings visible
([Apple segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls),
[Apple toggles](https://developer.apple.com/design/human-interface-guidelines/toggles)).

Android's official guidance likewise defines a single-select segmented button
as a side-by-side choice with one selected option
([Android Developers](https://developer.android.com/develop/ui/compose/components/segmented-button)).
For accessibility, the Storybook presentation uses a labelled radio group,
matching the WAI-ARIA single-selection contract
([W3C radio group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)).

Visible labels stay short. The full union is available in the accessible option
label: `Needs attention: mistakes, unclear, slow, or timed out`. No explanatory
sentence or Boolean formula is added to the History screen.

## Naming

Use **`All / Needs attention`**.

`Needs attention` includes correct-but-slow and user-marked unclear attempts
without colliding with other product concepts:

- `Needs review` conflicts with the separate Scheduled Review queue.
- `Training focus` or `Focus` belongs to the planned Training Focus project.
- `Mistakes` and `Wrong` exclude slow and unclear attempts.
- `Flagged` sounds manual and does not naturally include wrong or timed-out
  attempts.
- `Problems` overstates a correct-but-slow attempt.
- `Attention` is shorter but less self-explanatory.

These naming conclusions are product-language judgments rather than claims from
the cited design systems.

## Filter Logic

Treat `Needs attention` as one atomic view predicate. Its four reasons use OR
internally. Every advanced facet then narrows that union with AND:

```text
Needs attention AND Source: Review AND Range: 30 days
```

The `Attention flags` facet follows normal multi-select behavior:

```text
(Mistakes OR Unclear OR Slow OR Timed out) AND Result: Correct
```

Selecting no attention flag places no restriction on that facet. The applied
state summary uses plain language such as
`Attention: Mistakes or Unclear or Slow`.

Do not show the formula in the interface. Keep the selected view, result count,
and category/value applied-state tokens close to the results.

DWP's filter research recommends AND across different criteria, notes that
multiple values inside one criterion naturally use OR, and recommends visible
result count and applied state
([DWP filter logic](https://design-system.dwp.gov.uk/contribute/filters/summary#adding-more-filters-should-reduce-the-number-of-results),
[DWP filter state](https://design-system.dwp.gov.uk/contribute/filters/design-notes#state)).
It also notes that expanded filters above mobile results consume the viewport,
supporting the decision to keep only one high-value shortcut visible
([DWP mobile filter layout](https://design-system.dwp.gov.uk/contribute/filters/design-notes#mobile-views)).

`All sources` is the Source facet default and does not appear as an applied
filter token. It is equivalent to clearing that facet
([DWP All/any option](https://design-system.dwp.gov.uk/contribute/filters/design-notes#allany-option)).

## Storybook Acceptance Checks

- Initial state selects `All` and `All sources`.
- `Needs attention` includes slow, wrong, unclear, and timed-out attempts.
- An attempt matching multiple reasons appears once.
- A normal correct, on-time, clear attempt is excluded.
- Adding an advanced filter can only narrow the attention union.
- `Mistakes`, `Unclear`, `Slow`, and `Timed out` can be selected
  independently; multiple selections use OR and appear once in the
  applied-state summary.
- `Mistakes` may overlap `Result: Wrong` without duplicating an attempt.
- Review membership reads `All / In queue / Not in queue`, not
  `All review states / Queued / Clear`.
- Themes is collapsed when filters open, retains a compact selection summary,
  and reveals all 24 curated choices on demand.
- One selected theme appears by name in the applied summary; multiple themes
  appear once as `{n} themes selected`. Selecting all 24 named themes keeps the
  disclosure to one line and reads `24 themes selected` below.
- The expanded filter region has one visible outer boundary and appears above
  the primary History view selector; Themes does not add a nested card boundary.
- Reset restores `All`, `All sources`, and the default range.
- At 320-point width, both segments and the filter button remain visible
  without horizontal scrolling.
- Assistive technology announces one selected option in a labelled radio group.
