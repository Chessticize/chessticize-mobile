# Design Parity Backlog

Audit date: 2026-07-02, against `MOBILE_UI_DESIGN.md` (authoritative spec) and
`assets/mobile-full-design-board.png` (visual direction). Line references are to
`apps/mobile/src/components/PracticePocScreen.tsx` at commit `f062bf0` and will drift.

## Current Goal

**The design-board goal is closed as DONE (2026-07-02).** All ten design-board
screens exist at visual parity, the accessibility/testID contract is complete,
the color/typography tokens match, and the architecture boundary (UI renders
view models, domain packages compute outcomes) is respected.

This document is the audit record behind that call. The V1 completion record is
`V1_IMPLEMENTATION_GUIDE.md`, which supersedes the priorities below where they
conflict — notably, pack downloading/import/removal is cut from v1, which
retires items 4 and 5's import aspects. Stop doing standalone visual polish
PRs; batch any polish into the feature PR that touches that screen.

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

## P0 — Spec Violations And Correctness Gaps (Resolved)

1. **Arrow Duel scheduled review auto-advances after the punishment line.**
   *(Resolved 2026-07-03: a wrong due Arrow Duel review records the result,
   stays on the same puzzle after the punishment line, and exposes a manual
   Continue button. Covered by the mobile component test
   "keeps a wrong due Arrow Duel review on the same puzzle until Continue is
   pressed".)*

2. **History speed and review-status filters were client-side and page-local.**
   *(Resolved 2026-07-03: `speedSeconds` and `reviewStatus` are part of the
   domain `getHistoryView` query and are applied before paging in core, memory
   store, and SQLite store coverage.)*

3. **Custom sprint theme control was inert.** *(Resolved 2026-07-03: custom
   sprint start/count commands pass the selected theme through the service into
   domain puzzle selection, and the UI exposes a broaden-theme recovery when
   coverage is too narrow.)*

4. **Packs tab was entirely mock.** *(Superseded 2026-07-02: pack
   download/import/removal is cut from v1 and the UI for it was removed. The
   remaining v1 work is bundling a real puzzle set and driving the Packs tab
   from its real metadata — see `V1_IMPLEMENTATION_GUIDE.md` item 1. Resolved
   2026-07-03: the Packs tab now renders the bundled Core Pack from manifest
   metadata.)*

5. **Custom sprint "Previous configs" were hardcoded placeholders.**
   *(Resolved 2026-07-03: recently used custom configs are persisted through the
   store/service boundary and rendered as reusable rows with last-played and
   per-config rating data.)*

## P1 — Required Behavior (Resolved)

6. **No paused/backgrounded session state.** *(Resolved 2026-07-03: `paused` is
   a domain sprint status, pause/resume preserve remaining time, stores keep
   paused sprints open, and the mobile UI renders an explicit paused session
   panel.)*
7. **Punishment-line playback has no pause/step controls.** *(Resolved
   2026-07-02: the current guided interaction is the intended behavior — the
   opponent's refutation auto-plays, then the user plays each punishment-line
   move themselves following the guide arrow, with live Stockfish evaluation
   of the current position, until the line ends. Replay is reset-based. The
   spec was updated; no transport controls are wanted.)*
8. **Green/red candidate arrows do not render on the review surface itself.**
   *(Resolved 2026-07-02: current behavior accepted as intended — the review
   surface uses the color legend and "You chose" text marker and keeps the
   board clear for the guided punishment line; the colored candidate arrows
   render in Analysis mode at the initial position. The spec was updated.)*
9. **Arrow Duel candidate ordering was index-parity, not randomized/persisted.**
   *(Resolved 2026-07-03: candidate ordering is seeded by session and puzzle
   identity so each attempt is stable without always placing the best move in
   candidate A.)*
10. **Analysis checkmate showed an empty candidate list** instead of `1-0`/`0-1`.
    *(Resolved 2026-07-03: analysis and guided review current-position lines
    format terminal checkmate as the game result.)*
11. **No loading skeleton for the session shell.** *(Resolved 2026-07-03: the
    practice screen renders a session-loading skeleton for the status row and
    board surface.)*

## P2 — Deviations to confirm or tidy

12. Review queue per-item cards render only when the filter panel is expanded.
    *(Resolved 2026-07-03: keep this behavior for v1. The default Review Queue
    surface intentionally shows the due summary plus difficulty rows for calm
    density; expanded filters expose per-item cards and grouped starts.)*
13. "Arrow Duel only" filters in History/Review are aliases for the mode filter,
    not independent toggles. *(Resolved 2026-07-03: keep as a user-facing shortcut
    alias for `mode = arrow_duel`; it should not create a second independent
    filter dimension.)*
14. History lacks a dedicated sprint-config filter. *(Resolved 2026-07-03:
    `ratingKey` is the sprint-config bucket for v1 because it encodes mode,
    duration, pace, and theme; separate speed/theme filters refine the bucket.)*
15. `SessionScoreStrip` below the board duplicates status-bar progress/mistakes.
    *(Resolved 2026-07-03: keep for v1 because it provides a stable compact
    board-adjacent score readout while the status bar remains the global session
    chrome.)*
16. "Best Streak" on Sprint Results is not in the spec field list. *(Resolved
    2026-07-03: keep and spec it as a useful sprint-result metric alongside
    rating change and elapsed time.)*
17. Settings sync section sits below Profile; spec says "near the top."
    *(Resolved 2026-07-03: Sync now renders first in Settings.)*
18. Custom theme list is only Mixed/Mate/Endgame; spec says Mixed plus supported
    tactical themes from the domain config. *(Resolved 2026-07-03: Custom Sprint
    now exposes Mixed plus the supported theme strings used by domain puzzle
    selection.)*

## Process

See `AGENTS.md > Branch And PR Workflow`: one draft feature PR per backlog item
(or coherent group), push increments to that PR, mark ready-for-review to trigger
the iOS Detox suite once, merge when the item is done. Do not open per-tweak PRs.
