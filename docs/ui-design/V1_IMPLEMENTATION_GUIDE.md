# V1 Implementation Guide

Status date: 2026-07-02. This document is the active work plan. It supersedes the
priorities in `DESIGN_PARITY_BACKLOG.md` where they conflict; the backlog remains
the detailed audit record. `MOBILE_UI_DESIGN.md` remains authoritative for screen
behavior specs, subject to the v1 scope cuts below.

## Goal Status

The previous goal — *"implement the ui-design, especially the detailed design
from mobile-full-design-board.png"* — is **DONE**. All ten design-board screens
are implemented at visual parity: layout, color/typography tokens, iconography,
and the accessibility/testID contract match the design, and the architecture
boundary (UI renders view models; domain packages compute outcomes) is
respected. See `DESIGN_PARITY_BACKLOG.md` for the audit evidence.

The v1 goal is: **make every visible surface behaviorally real** — no mock data,
no inert controls, no spec-violating flows — within the v1 scope below.

## V1 Scope Cuts

1. **No pack downloading.** Optional packs, pack import, manifest download
   validation, and pack removal are out of v1. The Packs tab shows the bundled
   Core Pack, its coverage, and license/source attribution only. The
   `packs-import` / `packs-remove` accessibility contract entries are deferred
   with the feature. (UI cut implemented 2026-07-02.)
2. **Bundled puzzles instead.** V1 ships with enough puzzles inside the app for
   real training. This is now a build/data task, not a networking feature.

## V1 Work Plan (ordered)

### 1. Bundle a real puzzle set

The app currently defaults to the `familiar15` fixture (15 puzzles); a
1,000-puzzle presolved fixture (`fixtures/puzzles/presolved-1000.json`) exists
behind the dev-only source switch.

- Make the release default a real bundled pack sized for training across the
  600–1600 rating band with theme and Arrow Duel coverage (target: enough that
  a daily user does not see repeats for weeks; expand the presolve pipeline
  from 1k as needed).
- Keep `familiar15` as the deterministic regression set behind the dev-only
  test-source switch, and hide that switch in release builds (spec requirement).
- Drive the Packs tab's coverage card and pack detail (count, rating range,
  themes, Arrow Duel count, manifest hash, build date) from the real bundled
  pack metadata instead of the hardcoded catalog entry.

### 2. Behavioral gaps that misrepresent state (backlog P0)

- History speed and review-status filters must move into the domain query
  (`getHistoryView`) — today they filter only the loaded page client-side, so
  counts and Analysis Review prev/next are wrong.
- Custom sprint theme control must actually constrain puzzle selection; today
  it is inert local state, so the eligibility summary can lie.
- Custom sprint "Previous configs" must be real persisted configs, not
  hardcoded placeholder rows.

### 3. Required behavior not yet implemented (backlog P1)

- Paused/backgrounded session state with explicit UI, driven by domain rules.
- Green/red candidate arrows on the Arrow Duel review surface itself (not only
  inside Analysis mode), plus a non-color marker on the user's choice.
- Randomized, attempt-persisted Arrow Duel candidate ordering (domain change;
  today it is puzzle-index parity, so the first puzzle always shows the best
  move as candidate A).
- Analysis panel should show `1-0` / `0-1` at checkmate instead of an empty
  candidate list.
- Session loading skeleton (status bar + board placeholder).

### 4. Tidy-ups (backlog P2, fold into whichever PR touches the screen)

See `DESIGN_PARITY_BACKLOG.md` items 12–18. Resolve or explicitly record each
decision; do not open standalone polish PRs for them.

## Out of Scope for V1

- Pack downloading/import/removal (cut above).
- Game Review (excluded by the design doc).
- Android release work (iOS first, per repo direction).
- Chess.com / Lichess account import (design doc: not prioritized).

## Process

Follow `AGENTS.md > Branch And PR Workflow`: one draft feature PR per numbered
work item above (or coherent group), push increments to it, mark
ready-for-review to run the iOS Detox suite once, merge when the item is done.
