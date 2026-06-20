# Mobile UI Design

This document captures the current Chessticize web Puzzle Sprint experience and proposes a cleaner mobile-first UI direction for Chessticize Mobile. Game Review is intentionally out of scope for the mobile app.

## Current Web Observations

The current web app was reviewed in Chrome on `chessticize.com`, focused on Puzzle Sprint flows. Raw screenshots were captured during review, but public repository artifacts use a sanitized schematic so usernames, exact ELO values, personal stats, and dates are not published.

### Sanitized Capture Summary

![Current web observed flow](assets/current-web-observed-flow.svg)

### Functional Inventory

- Main navigation includes Home, Puzzle Sprint, Game Review, and Settings. Mobile should exclude Game Review from the app scope.
- Puzzle Sprint dashboard shows daily stats, Standard Sprint, Arrow Duel, Blitz Sprint, recent custom sprint configs, and a Custom Sprint entry.
- Standard Sprint session shows Abandon, success progress, timer, turn prompt, and a large chessboard.
- Arrow Duel session shows Abandon, success progress, timer, a short instruction card, a chessboard, and two candidate arrows.
- Custom Sprint setup includes mode, theme, duration, time per puzzle, computed puzzle count, ELO type, and previous custom configs.
- Settings includes chess platform connections and ELO editing. Mobile v1 should keep ELO reset/rating management but not prioritize chess.com or Lichess account import.

### Current UI Issues To Avoid

- Desktop navigation and wide centered cards do not translate cleanly to mobile practice.
- The tan/brown board dominates the screen and makes the product feel warmer and heavier than desired.
- Arrow Duel uses decorative emoji in instructional text; mobile should avoid emoji and rely on concise labels and state colors.
- The web dashboard mixes summary stats, mode selection, and recent configs in one broad page. Mobile needs a tighter task-first hierarchy.
- Settings exposes many ELO fields as editable inputs. Mobile should prefer explicit reset/adjust flows and avoid a dense form by default.

## Complete App Design Board

The design board below is an imagegen-rendered high-fidelity concept for reviewing the overall product shape. It is useful for visual direction, but the written specifications in this document are authoritative for exact copy, scoring behavior, licensing text, and implementation details.

![Complete mobile design board](assets/mobile-full-design-board.png)

The board covers these major screens:

- Practice Home
- Regular Sprint Active
- Arrow Duel Active
- Sprint Results
- Review Queue
- Arrow Duel Review
- History
- Custom Sprint Setup
- Settings
- Puzzle Packs

Screen inventory:

| Screen | Main layout | Primary actions | Navigates to |
| --- | --- | --- | --- |
| Practice Home | Mode list, progress summary, due review strip, bottom tabs | Start Standard, Arrow Duel, Blitz, Custom; resume interrupted session | Active Sprint, Custom Sprint, Review Queue |
| Regular Sprint Active | Focused session shell, status bar, board, prompt | Make board move, abandon, complete/fail sprint | Sprint Results |
| Arrow Duel Active | Focused shell, status bar, board, neutral candidate arrows, A/B chips | Choose candidate, abandon, complete/fail sprint | Sprint Results, Arrow Duel Review |
| Sprint Results | Solved count, accuracy, rating change, mistakes, actions | Review mistakes, play again, done | Review Item, Practice Home |
| Review Queue | Due/overdue summary, difficulty groups, start button | Start due review, filter queue | Review Item |
| Arrow Duel Review | Board, green/red arrows, choice marker, playback controls | Play line, step line, finish review | Review Complete, History |
| History | Filter chips, attempt rows, result/rating/review state | Filter Wrong 7d, open attempt | Attempt Detail, Review Item |
| Custom Sprint Setup | Mode/theme/timing controls, estimate, rating range, start | Start sprint, save template | Active Sprint |
| Settings | Sync, reset, export, local data, about | Toggle iCloud, reset ELO, export/delete | Confirm Sheet, Sync Disclosure |
| Puzzle Packs | Installed/optional packs, metadata, source/license notes | Import, enable, remove, inspect license | Pack Detail |

## Mobile Information Architecture

Use a five-tab app shell:

- Practice: quick start, active session, custom sprint setup, and Arrow Duel entry.
- Review: due mistake reviews and spaced repetition queue.
- History: attempts, sprint sessions, filters, and "Wrong in the last 7 days".
- Packs: bundled pack, optional packs, rating/theme coverage, imports, and license/source attribution.
- Settings: iCloud sync, local data, ELO reset, export/delete data, and advanced rating adjustment.

There should be no mobile Home tab and no Game Review tab in v1.

![Mobile navigation flow](assets/mobile-navigation-flow.svg)

Navigation rules:

- Practice is the default launch tab.
- Active practice sessions hide the tab bar and use a focused session shell.
- Review and History both open the same board-based review surface, but with different entry context.
- Settings is the only place for data-destructive actions such as ELO reset and history delete.
- Packs owns puzzle pack visibility, imports, removals, coverage, source attribution, and license notes.
- Any sync error should be recoverable from Settings without blocking offline practice.
- Any puzzle pack error should be recoverable from Packs without blocking already-installed offline practice.

Primary flows:

| Flow | Steps | Notes |
| --- | --- | --- |
| Standard or Blitz practice | Practice Home -> Regular Sprint Active -> Sprint Results -> Practice Home | Board moves submit answers directly. |
| Arrow Duel practice | Practice Home -> Arrow Duel Active -> Sprint Results -> Arrow Duel Review | Candidate arrows are neutral until selection. |
| Custom sprint | Practice Home -> Custom Sprint Setup -> Regular Sprint Active or Arrow Duel Active -> Sprint Results | The selected mode determines the active session shell. |
| Due mistake review | Review Queue -> Review Item -> Review Complete -> Review Queue | Correct answers increase interval; failures shorten it. |
| Recent wrong review | History -> Wrong 7d filter -> Attempt Detail -> Review Item | History preserves original attempt context. |
| Puzzle pack management | Packs -> Pack Detail -> Import or Remove -> Packs | Installed packs remain usable offline. |
| iCloud and local data | Settings -> Sync Disclosure or Confirm Sheet -> Settings | Practice must keep working when sync is off. |

## Design Principles

- Board first: during practice and review, the board is the primary surface and must receive the largest stable area.
- Local-first clarity: the user should always know whether progress is local-only or syncing through iCloud.
- Calm density: show enough data for repeated training, but avoid desktop dashboards, marketing hero panels, or decorative statistics.
- One-handed portrait first: primary controls should sit below or immediately above the board and remain reachable.
- Business state comes from the local backend/domain core. UI screens render view models and dispatch typed intents.
- No hidden scoring changes: UI controls such as hint, skip, undo, or analysis must not appear in scored sprint mode unless the scoring rules explicitly support them.

## Visual Direction

The mobile UI should feel like a quiet training tool, not a marketing page.

![Clean mobile palette](assets/mobile-color-palette.svg)

Color tokens:

- App background: `#F8FAFC`
- Surface: `#FFFFFF`
- Primary text: `#111827`
- Secondary text: `#64748B`
- Border: `#E2E8F0`
- Accent: `#2563EB`
- Board light square: `#E6E8EB`
- Board dark square: `#7B8794`
- Correct: `#16A34A`
- Wrong: `#DC2626`
- Warning: `#D97706`
- Highlight: `#FACC15`

Style rules:

- No gradients, decorative blobs, or emoji.
- Use cards only for repeated list items, modals, and framed tools.
- Avoid nested cards.
- Keep controls stable in height and width to prevent layout shift during timers and progress changes.
- Use icons only where they reduce text, with accessible labels.
- Board and timer areas should be optimized for one-handed portrait use.

Typography:

- Use the platform system font.
- Screen title: 22-24 pt, semibold.
- Section title: 16-18 pt, semibold.
- Body text: 15-16 pt.
- Metadata and helper text: 12-13 pt.
- Timer text: tabular numerals, 18-22 pt depending on surface.

Spacing and shape:

- Base spacing unit: 4 px.
- Screen horizontal padding: 16 px on phones.
- Component gap: 8, 12, or 16 px.
- Cards and sheets: 8 px radius unless native platform controls require otherwise.
- Board radius: 6-8 px, never a floating decorative card inside another card.
- Hit target minimum: 44 x 44 px.

Core components:

- `SessionStatusBar`: mode, ELO, progress, timer, mistakes, pause/abandon affordance.
- `ChessboardSurface`: reused board component plus highlight/arrow overlay adapter.
- `ModePicker`: compact list or segmented choice for Standard, Arrow Duel, Blitz, Custom.
- `ReviewQueueHeader`: due count, overdue count, and next review estimate.
- `HistoryFilterBar`: date/result/mode/theme chips with a persistent "Wrong in the last 7 days" shortcut.
- `SettingsRow`: label, value, status, and disclosure or switch.
- `PackCoverageCard`: pack name, installed state, puzzle count, rating range, theme coverage, Arrow Duel count, and attribution status.
- `DestructiveActionSheet`: reset/delete confirmation with explicit copy.

## Core Screen Drafts

### Practice Session

![Mobile practice wireframe](assets/mobile-practice-wireframe.svg)

Practice session layout:

- Top session bar: mode, ELO, progress, timer, mistakes, and exit.
- Board gets most of the screen and remains visually stable.
- Prompt and action area live below the board.
- Regular puzzles use board moves as the primary input.
- Arrow Duel uses board arrows plus two candidate action chips below the board when needed.

Practice session states:

- Loading: skeleton session bar plus reserved board space. Do not shift layout when the puzzle appears.
- Ready: board interactive, prompt visible, timer running.
- Correct move: brief green confirmation, advance automatically after a short delay.
- Wrong move: red feedback, attempt is recorded, review scheduling happens in the backend/domain core.
- Sprint complete: summary sheet with rating change, accuracy, time, mistakes, and review queue impact.
- Sprint failed: summary sheet with failure reason and a retry action.
- Paused/backgrounded: timer paused only according to domain rules; UI must show paused state explicitly.

Practice controls:

- No default Hint button in scored sprint mode.
- No default Skip button in scored sprint mode.
- No Submit button for regular board moves; the move itself is the submission.
- Abandon is present but secondary and requires confirmation.
- Analysis is available after the attempt/session, not during a scored puzzle unless the mode is explicitly non-scored.

### Arrow Duel Review

![Mobile Arrow Duel review wireframe](assets/mobile-arrow-duel-review-wireframe.svg)

Arrow Duel review behavior:

- Always show both original candidate arrows after review.
- Correct Stockfish best move is green.
- Blunder or inferior candidate is red.
- User's original choice gets an additional marker.
- If the user chose wrong, automatically play the opponent response or punishment line.
- Prefer stored puzzle solution lines for explanation; fall back to local Stockfish when the stored line is not enough.

Arrow Duel active-session rules:

- Candidate arrows are neutral before selection.
- Candidate move chips may show SAN, UCI, or both, but the final choice should be locked in the domain spec before implementation.
- Candidate ordering is randomized by backend/domain logic and stored with the attempt.
- The board and chips must not reveal which move is best before selection.

Arrow Duel review rules:

- Green always means the best move.
- Red always means the inferior candidate.
- User-selected wrong move receives an additional marker that is distinguishable without color alone.
- Playback starts automatically after a wrong answer, but the user can pause, replay, or step through the line.
- Review copy should explain the tactical reason only when the data supports it; otherwise show engine line and evaluation shift.

### Custom Sprint Setup

![Mobile custom sprint setup wireframe](assets/mobile-custom-config-wireframe.svg)

Custom sprint layout:

- Use a focused setup screen or bottom sheet rather than a desktop-style page.
- Keep mode, theme, duration, and per-puzzle time as compact controls.
- Show computed puzzle count and ELO type as a live summary.
- Show previous configs below the setup area as compact reusable rows.

Custom sprint controls:

- Mode: Regular Puzzles or Arrow Duel.
- Theme: Mixed plus supported tactical themes.
- Duration: use allowed sprint durations from the domain config.
- Per-puzzle time: use allowed per-puzzle times from the domain config.
- Max mistakes: default from domain config; expose only if custom scoring is in v1.
- Summary: target puzzle count, ELO type, current rating, and whether the config has separate scoring history.
- Previous configs: compact rows with mode, theme, timing, last played, and current ELO.

Custom sprint behavior:

- Changing any control updates the summary immediately.
- Start button is disabled only when the config is invalid or no eligible puzzles exist locally.
- If the selected puzzle pack lacks enough eligible puzzles, show a local pack warning and offer a broader theme/rating range.

## Screen-Level Requirements

### Practice

- Default entry opens Practice, not a landing page.
- Quick choices: Standard Sprint, Arrow Duel, Blitz, Custom.
- Current ELO appears near each mode, but detailed rating management stays in Settings.
- The active session should remain readable at small phone widths.
- Abandon must be visible but visually secondary.
- If a session was interrupted, Practice should offer Resume before Start New.

### Review

- First screen shows due mistake count and starts review immediately.
- Filters include due, overdue, failed again, Arrow Duel only, and theme.
- Review should reuse the same board surface as Practice.
- Correct reviews increase interval; failed reviews shorten interval.
- Empty state should say when the next review is due and offer regular practice.
- Review cards should show mode, theme, last wrong date, due state, and current interval.

### History

- Quick filters include "Wrong in the last 7 days", mode, theme, rating range, and sprint config.
- Each row should show result, mode, puzzle rating, elapsed time, date, and review status.
- Tapping a row opens review with original attempt context.
- History filters should be horizontally scrollable chips on phones.
- Failed attempts should clearly show whether they are already in the review queue.

### Settings

- iCloud sync toggle appears near the top with clear local-first copy.
- ELO reset is explicit and separate from deleting history.
- Advanced manual ELO adjustment should be hidden behind an "Advanced ratings" affordance.
- iCloud sync default state should match the sync plan: default on for fresh iOS installs with disclosure, explicit prompt before uploading existing local-only progress.

### Packs

- Bundled core pack appears first and must show installed/active state.
- Optional packs show estimated puzzle count, rating range, theme coverage, and Arrow Duel count.
- Pack detail shows source attribution, presolve status, manifest hash, build date, and license notes.
- Importing a pack uses a visible progress state and validates the manifest before activation.
- Removing a pack is a destructive action and must not remove user attempt history.
- If no optional packs are installed, the screen should still make clear that the bundled pack works fully offline.
- Puzzle pack screen should show bundled pack, imported packs, rating coverage, theme coverage, Arrow Duel count, and license/source attribution.

## Accessibility And Automation Contracts

Every screen must expose stable accessibility labels and test IDs for Detox.

Required labels/test IDs:

- `practice-tab`
- `review-tab`
- `history-tab`
- `settings-tab`
- `packs-tab`
- `practice-mode-standard`
- `practice-mode-arrow-duel`
- `practice-mode-blitz`
- `practice-mode-custom`
- `session-board`
- `session-timer`
- `session-progress`
- `session-mistakes`
- `session-abandon`
- `arrow-duel-candidate-a`
- `arrow-duel-candidate-b`
- `review-start-due`
- `history-filter-wrong-7-days`
- `settings-icloud-sync-toggle`
- `settings-reset-elo`
- `packs-installed-core`
- `packs-import`
- `packs-remove`
- `packs-license-notes`

Accessibility rules:

- Do not rely on color alone for correct/wrong states.
- Dynamic timer changes must not spam screen readers.
- Board coordinates and selected squares need accessible descriptions in review mode.
- Destructive confirmations must identify what will be reset or deleted.
- iCloud sync status must be readable as text, not only as an icon.

## Testing Implications

- Every core screen must expose stable accessibility labels for Detox.
- Component tests should verify user-visible behavior, not component internals.
- UI should receive view models from backend/domain packages; React components must not compute sprint outcomes, ELO updates, review scheduling, or Arrow Duel correctness.
- E2E flows should cover Practice start, Arrow Duel choice, wrong-answer review, custom sprint setup, history filtering, pack management, ELO reset, and iCloud sync toggle.
- Design QA should include iPhone SE-sized viewport, modern iPhone portrait, and at least one landscape/tablet sanity pass.
- E2E assertions should target stable labels/test IDs from this document.

## Open Design Questions

- Whether Arrow Duel candidate chips should display SAN only, coordinate notation only, or both.
- Whether manual ELO editing should ship in v1 or only reset/import/export.
- Whether iCloud sync should show first-run disclosure as a sheet or as a persistent Settings banner for the first session.
- Whether custom max mistakes is part of v1 custom sprint or should remain fixed by scoring mode.
