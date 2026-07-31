# Accessibility Audit

This document is the evidence record for issue #416 and the App Store
accessibility metadata contract in
[`config/app-store-accessibility-v1.json`](../config/app-store-accessibility-v1.json).
It describes the production app at commit
`211ec0edb2b4b2a877efd429f3cba190225a1501`, audited on 2026-07-29.

The audit follows Apple's rule that a feature may be declared only when every
common task can be completed with that feature. Chessticize's common tasks are
starting and solving a Standard puzzle Sprint, comparing and playing an Arrow
Duel move, completing scheduled Review, replaying a puzzle, reading History,
and changing Settings.

## App Store Connect decision

Declare **no accessibility features** for either iPhone or iPad in the current
production version. This is an intentional accuracy decision, not a statement
that the app has no accessible elements. Many buttons, tabs, state changes, and
status messages have useful labels and roles, but partial support does not meet
Apple's common-task threshold.

Use this public accessibility URL after deployment:

`https://chessticize.github.io/chessticize-mobile/accessibility/`

The local audit environment did not contain App Store Connect API credentials.
Saving the URL and retaining an App Store Connect screenshot or export is an
owner-operated external gate. Until that evidence exists, leave every feature
unselected. No binary is required to preserve accurate undeclared metadata or
to add the accessibility URL.

## Remediation policy

As of 2026-07-31, the focused gap issues #426 through #432 are closed as not
planned. This is a demand-driven deferral, not evidence that any gap was fixed.
The known limitations remain in production, and the corresponding App Store
features must remain undeclared.

Broad remediation will be reconsidered when direct accessibility reports or
documented user needs justify the implementation and its ongoing regression
coverage across iPhone and iPad. Chessticize does not collect usage analytics,
so a report that identifies the affected puzzle flow, device, and assistive
setting is the primary signal for reopening this work.

## Declaration matrix

| Apple feature | iPhone | iPad | Evidence and next action |
| --- | --- | --- | --- |
| VoiceOver | Do not declare | Do not declare | Standard, Arrow Duel, Review, and Replay expose the board as one image. There is no accessible piece, legal-destination, or candidate-move input. Deferred in #426. |
| Voice Control | Do not declare | Do not declare | A user cannot name or number a board move and complete the primary puzzle task. Deferred in #426. |
| Larger Text | Do not declare | Do not declare | At the largest accessibility size, Start/Edit/Add Run controls, navigation labels, History controls, and Settings content clip or overlap. The same failure occurs in landscape iPad. Deferred in #427. |
| Sufficient Contrast | Do not declare | Do not declare | White 11pt countdown text on `#F59E0B` is 2.15:1; green 11pt progress text on white is 3.30:1. Both are below 4.5:1 for ordinary text. Deferred in #428. |
| Differentiate Without Color Alone | Do not declare yet | Do not declare yet | Sampled states pair color with labels, symbols, counts, borders, or placement, but the complete grayscale common-task pass is not recorded. Deferred in #432. |
| Reduced Motion | Do not declare | Do not declare | Piece movement, layout transitions, and drag springs do not observe the system Reduce Motion setting. Deferred in #430. |
| Captions | Do not declare | Do not declare | Chessticize has no timed video or spoken-media experience. Move sounds do not make this declaration applicable. |
| Audio Descriptions | Do not declare | Do not declare | Chessticize has no video experience requiring a descriptive audio track. |
| Dark Interface | Do not declare | Do not declare | Enabling system Dark Mode leaves all common puzzle surfaces in the light palette. Deferred in #431. |

## Critical-flow results

### Practice and Arrow Duel

- Run cards, Start, pause, abandon, result, and tab controls expose useful
  labels and selected or disabled state.
- The live Standard board appears as `image: Chess board...` with no move
  actions or accessible alternative.
- The live Arrow Duel board is also one image. The two visible candidate arrows
  are not independently operable through the accessibility tree.
- Timed-out, mistake, and Review outcomes use explicit text and counts rather
  than color alone.

### Review and Replay

- Review announces the puzzle index and side to move. Exit, previous, next,
  reset, analysis, and Review-schedule controls have labels.
- Both Review and Replay boards remain one non-operable image, so neither
  common task can be completed with VoiceOver or Voice Control.

### History

- Filter state, paging, and attempt rows expose descriptive labels, including
  puzzle mode, result, rating, theme, pace, source, and date.
- At the largest accessibility text size, the page header, segmented choice,
  and bottom navigation visibly truncate.

### Settings

- Settings rows, switches, links, and selected preferences expose labels,
  values, and selected state.
- The shared preference button is only 34pt high and has no hit slop. Controls
  such as iCloud On/Off and reminder Smart/time/Off therefore miss the 44pt
  target. Deferred in #429.
- At the largest text size, visible content and bottom navigation overlap or
  truncate.

## Device and visual evidence

The exact-head Release app was built and launched successfully on:

- iPhone 17, iOS 27.0, portrait;
- iPad Pro 13-inch, iOS 27.0, portrait and landscape.

At the standard text size, the iPad landscape Practice screen uses the intended
side navigation and two-column content layout without clipping. iPad marketing
and accessibility evidence should remain landscape-first. At the largest
accessibility size, that layout correctly collapses to one column, but the
top action row still overlaps and therefore does not satisfy Larger Text.

Raw simulator captures are intentionally kept under the ignored
`scratch/accessibility-audit/` directory because they contain local fixture
history. They are not store assets.

## Test conditions

- System text size: default `large` and
  `accessibility-extra-extra-extra-large`.
- Appearance: Light and Dark.
- Accessibility-tree inspection: normal controls plus active Standard, Arrow
  Duel, Review, and Replay boards.
- Static contrast calculation uses WCAG relative luminance and the exact
  production color tokens.
- Touch-target review covers shared style dimensions and the rendered critical
  controls.
- Orientation review covers iPhone portrait plus iPad portrait and landscape.

The grayscale, Differentiate Without Color, Increase Contrast, Reduce
Transparency, Bold Text, VoiceOver gesture, and Voice Control voice-command
passes remain incomplete. Their focused issues are retained as closed records
under the demand-driven deferral policy; they are not completed evidence.

## Release boundary

- Metadata-only: leaving unsupported features undeclared, adding the public
  accessibility URL, and later declaring a feature that the unchanged live
  binary fully passes.
- New binary required: board interaction, Dynamic Type layout, contrast,
  touch-target, Reduce Motion, Dark Interface, or any other app code or UI fix.

## Apple references

- [Accessibility nutrition label overview](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)
- [Manage accessibility nutrition labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels/)
- [VoiceOver criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria/)
- [Voice Control criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voice-control-evaluation-criteria/)
- [Larger Text criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria)
- [Sufficient Contrast criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria)
- [Differentiate Without Color Alone criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/differentiate-without-color-alone-evaluation-criteria)
- [Reduced Motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)
- [Dark Interface criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/dark-interface-evaluation-criteria/)
