# V1 Implementation Guide

Status date: 2026-07-03. This document is the V1 implementation completion
record. It supersedes the priorities in `DESIGN_PARITY_BACKLOG.md` where they
conflict; the backlog remains the detailed audit record. `MOBILE_UI_DESIGN.md`
remains authoritative for screen behavior specs, subject to the v1 scope cuts
below.

## Goal Status

The previous goal — *"implement the ui-design, especially the detailed design
from mobile-full-design-board.png"* — is **DONE**. All ten design-board screens
are implemented at visual parity: layout, color/typography tokens, iconography,
and the accessibility/testID contract match the design, and the architecture
boundary (UI renders view models; domain packages compute outcomes) is
respected. See `DESIGN_PARITY_BACKLOG.md` for the audit evidence.

The v1 goal — **make every visible surface behaviorally real** within the v1
scope below — is **DONE**. All numbered work items below have implementation
notes and validation coverage in code, component tests, core/storage tests, and
iOS CI.

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

- Make the release default a real bundled pack sized for training across the
  600–1600 rating band with theme and Arrow Duel coverage (target: enough that
  a daily user does not see repeats for weeks; expand the presolve pipeline
  from 1k as needed).
- Keep `familiar15` as the deterministic regression set behind the dev-only
  test-source switch, and hide that switch in release builds (spec requirement).
- Drive the Packs tab's coverage card and pack detail (count, rating range,
  themes, Arrow Duel count, manifest hash, build date) from the real bundled
  pack metadata instead of the hardcoded catalog entry.

Implementation note: item 1 is implemented by shipping `fixtures/puzzles/bundled-core-pack.json`
as the release-default offline Core Pack. The pack contains 3,000 unique
positions in the 600–1600 rating band, includes broad tactical themes and Arrow
Duel coverage, and is paired with `bundled-core-pack.manifest.json` for count,
rating range, theme count, Arrow Duel count, manifest hash, build date, source,
license, and presolve metadata. `familiar15` and `presolved-1000.json` remain
test-only sources behind the dev puzzle-source switch, while production-like
services hide that switch.

### 2. Implemented behavioral gaps that misrepresented state (backlog P0)

- History speed and review-status filters must move into the domain query
  (`getHistoryView`) — today they filter only the loaded page client-side, so
  counts and Analysis Review prev/next are wrong.
- Custom sprint theme control must actually constrain puzzle selection; today
  it is inert local state, so the eligibility summary can lie.
- Custom sprint "Previous configs" must be real persisted configs, not
  hardcoded placeholder rows.

Implementation note: item 2 is implemented by extending the domain history query
with speed and review-status filters, making custom sprint theme selection part
of the service start/count command, and persisting previous custom sprint
configs through the store interface.

### 3. Implemented required behavior (backlog P1)

- Paused/backgrounded session state with explicit UI, driven by domain rules.
- Randomized, attempt-persisted Arrow Duel candidate ordering (domain change;
  today it is puzzle-index parity, so the first puzzle always shows the best
  move as candidate A).
- Analysis panel should show `1-0` / `0-1` at checkmate instead of an empty
  candidate list.
- Session loading skeleton (status bar + board placeholder).

Implementation note: item 3 is implemented by adding a domain `paused` sprint
state with `pauseSprint` / `resumeSprint`, preserving remaining time by shifting
the deadline on resume, keeping paused sessions open through the service/store
boundary, and rendering an explicit paused session UI. Arrow Duel candidate
order is now seeded by the session and puzzle identity so each attempt is stable
without always putting the best move in candidate A. The analysis current
position line handles terminal checkmate as `1-0` / `0-1`, and the practice
screen includes a session-loading skeleton for the status row and board surface.

### 4. Tidy-ups (backlog P2, fold into whichever PR touches the screen)

See `DESIGN_PARITY_BACKLOG.md` items 12–18. Resolve or explicitly record each
decision; do not open standalone polish PRs for them.

Implementation note: item 4 resolves the remaining P2 decisions. Review queue
item cards stay behind expanded filters for density, Arrow Duel-only remains a
mode-filter shortcut, History uses `ratingKey` as the v1 sprint-config bucket,
the board-adjacent score strip and Best Streak result metric are kept and
specified, Sync is moved to the top of Settings, and Custom Sprint exposes Mixed
plus supported tactical theme strings.

## Out of Scope for V1

- Pack downloading/import/removal (cut above).
- Game Review (excluded by the design doc).
- Android release work (iOS first, per repo direction).
- Chess.com / Lichess account import (design doc: not prioritized).

## Process

Follow `AGENTS.md > Branch And PR Workflow`: one draft feature PR per numbered
work item above (or coherent group), push increments to it, mark
ready-for-review to run the iOS Detox suite once, merge when the item is done.
