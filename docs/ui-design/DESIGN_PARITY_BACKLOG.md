# Design Parity Backlog

Audit date: 2026-07-02, against `MOBILE_UI_DESIGN.md` (authoritative spec) and
`assets/mobile-full-design-board.png` (visual direction). Line references are to
`apps/mobile/src/components/PracticePocScreen.tsx` at commit `f062bf0` and will drift.

## Current Goal

The visual design-board implementation is largely done. The goal is no longer
"implement the ui-design screens" — all ten design-board screens exist, the
accessibility/testID contract is complete, the color/typography tokens match, and
the architecture boundary (UI renders view models, domain packages compute
outcomes) is respected.

The updated goal is: **close the behavioral gaps between the implemented screens
and the written spec, replacing mock/placeholder surfaces with real domain-backed
behavior.** Work through the priorities below top-down. Stop doing standalone
visual polish PRs; batch any polish into the feature PR that touches that screen.

## Status Summary

Strongly at parity (audited, no action needed):

- Practice Home: mode rows, per-mode ELO, progress summary, review strip, resume-first.
- Regular/Blitz active session: status bar, board locking, feedback highlights,
  no hint/skip/submit, abandon confirmation, board tokens.
- Sprint Results: full field list, actions, history link, no embedded dashboard.
- Analysis Review panel: toolbar, engine status format, streaming eval rows,
  back/forward/reset isolation, no history/ELO mutations.
- Scheduled vs Analysis review separation: attempts recorded only for due source.
- Settings: sync toggle/disclosure/upload prompt, reset vs delete separation,
  advanced ratings, export, about/license.

## P0 — Spec violations and correctness gaps

1. **Arrow Duel scheduled review auto-advances after the punishment line.**
   Spec: "A wrong Arrow Duel review stays on the same puzzle after the punishment
   line. It must not auto-advance to the next review puzzle."
   `submitReviewArrowFollowUpMove` calls `advanceReview` on `puzzleSolved`
   (~L5052), which for `source === "due"` resets to the next due item (~L4815).
   Fix: stay on the puzzle, offer a manual Continue affordance.

2. **History speed and review-status filters are client-side and page-local.**
   `speedFilter` / `reviewStatusFilter` (~L3027-3041) filter only the currently
   loaded page, so counts are wrong and Analysis Review prev/next (which uses the
   unpaged `fullHistoryReviewView`, ~L984) navigates to rows hidden from the list.
   Fix: push both filters into `getHistoryView` in `packages/core/history-query.ts`
   and the storage query layer, with unit + integration tests.

3. **Custom sprint theme control is inert.** Theme is local state (~L1666) and is
   never passed to `onStart` or puzzle selection, so the eligibility summary and
   pack warning can misrepresent what will actually be selected. Fix: thread theme
   through the sprint start intent into domain puzzle selection.

4. **Packs tab is entirely mock.** `PACK_CATALOG` (~L6108) is hardcoded; install,
   remove, and import-validation states are local `useState` with no persistence,
   so "manifest validated before activation" and "remove keeps attempt history"
   are only cosmetically satisfied. Fix: a packs domain/storage service behind the
   existing UI contract. This is the largest remaining feature.

5. **Custom sprint "Previous configs" are hardcoded placeholders** (~L1671-1696).
   Fix: persist recently used custom configs and render them as real reusable rows
   with actual last-played and per-config ELO.

## P1 — Required behavior not yet implemented

6. **No paused/backgrounded session state.** Spec requires an explicit paused UI
   driven by domain rules; session status is only active/won/failed (~L241).
7. **Punishment-line playback has no pause/step controls.** Only replay-via-reset
   exists (~L4988-5023). Spec requires pause, replay, and step.
8. **Green/red candidate arrows do not render on the review surface itself.**
   They appear only in Analysis mode at the initial FEN (~L4666, L5455). Spec:
   both original candidates always shown after review, green=best, red=inferior,
   plus a non-color marker on the user's wrong choice on the board.
9. **Arrow Duel candidate ordering is index-parity, not randomized/persisted.**
   `beginArrowDuelPuzzle(puzzle, seed)` with seed = puzzle index
   (`packages/core/src/sprint-session.ts` ~L183; first puzzle always shows the
   best move as candidate A). Fix in domain: randomize and store order with the
   attempt.
10. **Analysis checkmate shows an empty candidate list** instead of `1-0`/`0-1`
    (`packages/core/src/engine-analysis.ts` ~L260). The result line already exists
    for punishment-line evals; reuse it for the analysis list.
11. **No loading skeleton for the session shell.** Board space is reserved (no
    layout shift) but spec asks for a skeleton status bar + board placeholder
    instead of the "Ready" text box (~L1122).

## P2 — Deviations to confirm or tidy

12. Review queue per-item cards render only when the filter panel is expanded
    (~L4383); the design board shows difficulty rows by default, so current
    behavior may be fine — decide and record.
13. "Arrow Duel only" filters in History/Review are aliases for the mode filter,
    not independent toggles.
14. History lacks a dedicated sprint-config filter (ratingKey buckets approximate it).
15. `SessionScoreStrip` below the board duplicates status-bar progress/mistakes;
    spec prefers calm density — consider removing one.
16. "Best Streak" on Sprint Results is not in the spec field list — keep or spec it.
17. Settings sync section sits below Profile; spec says "near the top."
18. Custom theme list is only Mixed/Mate/Endgame; spec says Mixed plus supported
    tactical themes from the domain config.

## Process

See `AGENTS.md > Branch And PR Workflow`: one draft feature PR per backlog item
(or coherent group), push increments to that PR, mark ready-for-review to trigger
the iOS Detox suite once, merge when the item is done. Do not open per-tweak PRs.
