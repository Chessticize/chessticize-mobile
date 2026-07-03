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

The design board below is an imagegen-rendered high-fidelity concept for reviewing the overall product shape. It is useful for visual direction, but the written specifications in this document are authoritative for exact copy, scoring behavior, chart placement, licensing text, and implementation details.

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
| Sprint Results | Win/loss status, solved count, rating change, mistakes, actions | Review mistakes, play again, done | Review Item, Practice Home |
| Review Queue | Due/overdue summary, difficulty groups, start button | Start due review, filter queue | Review Item |
| Arrow Duel Review | Board, green/red arrows, choice marker, playback controls | Play line, step line, finish review | Review Complete, History |
| History | Performance chart, range/type filters, attempt rows, result/rating/review state | Filter Wrong 7d, inspect sprint type/speed, open attempt | Attempt Detail, Review Item |
| Custom Sprint Setup | Mode/theme/timing controls, estimate, rating range, start | Start sprint, save template | Active Sprint |
| Settings | Local data, reset, export, about | Export data, delete local history, reset ELO | Confirm Sheet |
| Puzzle Packs | Installed/optional packs, metadata, source/license notes | Import, enable, remove, inspect license | Pack Detail |

## Mobile Information Architecture

Use a five-tab app shell:

- Practice: quick start, active session, custom sprint setup, and Arrow Duel entry.
- Review: due mistake reviews and spaced repetition queue.
- History: attempts, sprint sessions, filters, and "Wrong in the last 7 days".
- Packs: bundled pack, optional packs, rating/theme coverage, imports, and license/source attribution.
- Settings: local data, ELO reset, export/delete data, and advanced rating adjustment.

There should be no mobile Home tab and no Game Review tab in v1.

![Mobile navigation flow](assets/mobile-navigation-flow.svg)

Navigation rules:

- Practice is the default launch tab.
- Active practice sessions hide the tab bar and use a focused session shell.
- Review and History both open the same board-based review surface, but with different entry context.
- The app has two review concepts. Analysis Review is an unscored replay/analyze surface. Scheduled Review is the official spaced repetition flow that records review attempts and updates the queue.
- Settings is the only place for data-destructive actions such as ELO reset and history delete.
- Packs owns puzzle pack visibility, imports, removals, coverage, source attribution, and license notes.
- Any puzzle pack error should be recoverable from Packs without blocking already-installed offline practice.

Primary flows:

| Flow | Steps | Notes |
| --- | --- | --- |
| Standard or Blitz practice | Practice Home -> Regular Sprint Active -> Sprint Results -> Practice Home | Board moves submit answers directly. Win by solving the target count before time/mistake failure. |
| Arrow Duel practice | Practice Home -> Arrow Duel Active -> Sprint Results -> Arrow Duel Review | Candidate arrows are neutral until selection. Win by solving the target count before time/mistake failure. |
| Custom sprint | Practice Home -> Custom Sprint Setup -> Regular Sprint Active or Arrow Duel Active -> Sprint Results | The selected mode determines the active session shell. |
| Due mistake review | Review Queue -> Scheduled Review Item -> Review Complete -> Review Queue | Correct answers increase interval; failures reset or shorten it. Official review attempts are recorded in History. |
| Post-session analysis | Sprint Results or Scheduled Review Complete -> Analysis Review -> Results or Practice | Used to inspect mistakes immediately. It does not write History and does not change the spaced repetition schedule. |
| History replay | History -> Filtered row -> Analysis Review | History preserves original attempt context. Previous/next navigation stays inside the active History filter. |
| Puzzle pack management | Packs -> Pack Detail -> Import or Remove -> Packs | Installed packs remain usable offline. |
| Local data | Settings -> Confirm Sheet -> Settings | Progress stays on device; export and delete actions are explicit. |

## Design Principles

- Board first: during practice and review, the board is the primary surface and must receive the largest stable area.
- Local-first clarity: in v1, the user should see that progress is stored on device only. Do not imply cloud sync until a real sync engine ships.
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
- `PerformanceChart`: rating, wins/losses, accuracy, mistake rate, and solved count over a selected time range.
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
- Board coordinates should be visible enough for review/debug discussion without competing with pieces, arrows, or feedback highlights.

Practice session states:

- Loading: skeleton session bar plus reserved board space. Do not shift layout when the puzzle appears.
- Ready: board interactive, prompt visible, timer running.
- Correct move: brief green confirmation, advance automatically after a short delay.
- Wrong move: red feedback, attempt is recorded, review scheduling happens in the backend/domain core.
- Sprint complete: summary sheet with rating change, accuracy, time, mistakes, and review queue impact.
- Sprint failed: summary sheet with failure reason and a retry action.
- Paused/backgrounded: timer paused only according to domain rules; UI must show paused state explicitly.

Board input rules:

- The user can drag only their own side-to-move pieces while the board is unlocked.
- Opponent pieces are never draggable by user input.
- The board locks immediately after a submitted move and stays locked while the app validates the move, applies feedback, and plays any opponent reply animation.
- Premove is not part of the current UX. Input during a locked board state is ignored.
- Illegal moves and legal moves that are not accepted by the active puzzle state revert visually and do not mutate the domain state.
- Valid move indicators remain available for selectable own pieces.
- Correct feedback uses green cell highlights; wrong feedback uses red cell highlights; opponent or previous-line movement uses blue only when the user is not in an immediate correct/wrong feedback state.
- Feedback cell highlights do not need borders. Avoid stacking blue last-move highlights over green or red feedback.

Sprint scoring rules:

- Standard Sprint default: 5 minutes, 20 seconds per puzzle, target 15 correct puzzles.
- Blitz Sprint default: 5 minutes, 10 seconds per puzzle, target 30 correct puzzles.
- Arrow Duel default: 5 minutes, 30 seconds per puzzle, target 10 correct puzzles.
- Custom Sprint target count is `floor(durationSeconds / perPuzzleSeconds)`.
- A sprint is won only when the target correct count is reached before time expires and before mistake failure.
- A sprint is failed when time expires, the user abandons, or the user reaches 3 mistakes.
- Winning a sprint increases that sprint ELO type.
- Failing a sprint lowers that sprint ELO type.
- Each sprint mode and custom speed has its own ELO/statistics bucket.

Practice controls:

- No default Hint button in scored sprint mode.
- No default Skip button in scored sprint mode.
- No Submit button for regular board moves; the move itself is the submission.
- Abandon is present but secondary and requires confirmation.
- Analysis is available after the attempt/session, not during a scored puzzle unless the mode is explicitly non-scored.

Developer/test-build controls:

- Test builds may expose a puzzle source switch for manual QA.
- The familiar fixed set is for deterministic regression testing and quick simulator repros.
- The random larger fixture is for rating-based puzzle selection and pack coverage testing.
- Special fixtures may be added temporarily for focused bugs, but should not become the default familiar set unless they are stable regression samples.
- The puzzle source switch must be hidden in release builds.

### Arrow Duel Review

![Mobile Arrow Duel review wireframe](assets/mobile-arrow-duel-review-wireframe.svg)

Arrow Duel Analysis Review behavior:

- The colored candidate arrows render in Analysis mode at the puzzle's initial position: correct Stockfish best move is green, the blunder or inferior candidate is red.
- The review surface itself communicates the outcome with a color legend and a "You chose" marker in text (readable without color); it does not redraw the candidate arrows, keeping the board clear for the guided punishment line.
- User's original choice gets an additional marker.
- If the user chose wrong, automatically play the opponent response or punishment line.
- Prefer stored puzzle solution lines for explanation; fall back to local Stockfish when the stored line is not enough.
- While the punishment line is being replayed, show the current-position evaluation, not the original candidate evals.
- If the punishment line reaches checkmate, show the game result (`1-0` or `0-1`) and "Checkmate".
- The user can switch to analysis at any point. Analysis mode uses Stockfish, shows candidate lines, and does not mutate official review history.
- A wrong Arrow Duel review stays on the same puzzle after the punishment line. It must not auto-advance to the next review puzzle.

Arrow Duel active-session rules:

- Candidate arrows are neutral before selection.
- Candidate move chips may show SAN, UCI, or both, but the final choice should be locked in the domain spec before implementation.
- Candidate ordering is randomized by backend/domain logic and stored with the attempt.
- The board and chips must not reveal which move is best before selection.

Arrow Duel review rules:

- Green always means the best move.
- Red always means the inferior candidate.
- User-selected wrong move receives an additional marker that is distinguishable without color alone (currently the "You chose" text pill on the review surface).
- After a wrong answer, the opponent's refutation reply plays automatically, then the punishment line continues as a guided interaction: the user plays each expected move themselves by following the guide arrow, so no pause/step transport controls are needed. Replay is available by resetting the puzzle. Throughout the line, show the live Stockfish evaluation of the current position. (This guided interaction supersedes the playback transport bar drawn on the design board.)
- If the stored punishment line requires the user's next move, show that expected move with an arrow, wait for the user to make it, then play the next reply. Continue until the line ends, then stop.
- Review copy should explain the tactical reason only when the data supports it; otherwise show engine line and evaluation shift.
- In a Scheduled Review, selecting the wrong Arrow Duel candidate records a failed review attempt and resets or contracts that puzzle's schedule. The user may then enter Analysis Review to inspect the line without creating additional history.

### Analysis Review Panel

Analysis Review is the shared unscored board surface opened from sprint results, scheduled review results, and History.

Toolbar:

- Put close, previous, next, reset, flip, and Analysis controls on one compact row.
- Use icon buttons for navigation and board actions.
- The Analysis button should be visually prominent enough to scan quickly and should use the label "Analysis".
- When Stockfish is running, show engine status in compact form, for example `SF 18 NNUE · Depth 8/20`.

Engine line list:

- Candidate rows are compact single-line rows.
- Put the evaluation at the start of each row, then the row number and SAN move, then the label such as `Top move` or `Candidate`.
- Every live Stockfish row should have an engine evaluation. Do not fill the list with unscored legal moves.
- Rows are tappable. Tapping a row makes that move on the analysis board, adds the previous position to the back stack, clears the forward stack, and starts fresh analysis from the new position.
- The row order and eval values may change as Stockfish searches deeper. The UI should stream updates rather than wait for final depth.
- Back, forward, and reset affect only the analysis board and never create History rows, review attempts, ELO changes, or review schedule updates.
- Reset returns to the puzzle's initial review position, not the current Stockfish line's start if the user has navigated away.

Terminal and guided-line states:

- If the current analysis/review position is checkmate, show the game result (`1-0` or `0-1`) instead of misleading candidate rows.
- During Arrow Duel wrong-line playback, any eval shown under the board describes the current position. It must not reuse the original two candidate scores after the board has advanced.

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

- The Review tab is for Scheduled Review, not free analysis.
- First screen shows due mistake count and starts the official review flow.
- Filters include due, overdue, failed again, mode, sprint speed, Arrow Duel only, and theme.
- Scheduled Review should reuse the same board surface as Practice.
- Standard and Blitz review items use the original puzzle-solving flow and preserve the relevant target pace, such as a 20-second item from a 20-second sprint.
- Arrow Duel review items use the Arrow Duel choice flow.
- Correct reviews increase interval; failed reviews reset or shorten interval.
- The original sprint mistake creates a Scheduled Review queue item but is not itself a review-time lapse. Queue items start with `lapseCount = 0`; failed Scheduled Review attempts increment lapses; successful Scheduled Review attempts reduce lapses toward zero.
- Difficulty groups use review-time state: Easy means the item has no current lapse and the latest official review result was correct; Medium means the item is due from an original sprint miss with no review-time lapse; Hard means at least one failed Scheduled Review lapse remains.
- The "Failed again" filter matches review-time lapses only. It must not match every item that originated from a sprint mistake.
- Empty state should say when the next review is due and offer regular practice.
- Review cards should show mode, theme, last wrong date, due state, current interval, and source sprint type.
- The default Review Queue surface shows the due summary plus difficulty group rows for calm density; per-item review cards and grouped starts appear in the expanded filter view.
- The user can stop a Scheduled Review session at any time. Completed items are saved; unseen items remain due or overdue.
- After a Scheduled Review batch, the user may open Analysis Review for missed items. That follow-up inspection does not create history rows and does not update the schedule.
- Post-sprint Analysis Review is also unrecorded. It is for same-day exploration only; the scheduled memory-curve review still starts from the stored due date, normally the next day after the miss.

### History

- Quick range filters include 7 days, 30 days, 90 days, 1 year, and all time.
- History data must be pageable, including the all-time range.
- Quick content filters include "Wrong in the last 7 days", source type, theme, rating range, and review status.
- "Wrong in the last 7 days" is a query shortcut, not independent UI state. It
  is selected only when the active query is 7 days plus wrong results; changing
  either the range or result filter updates it automatically.
- The selected ELO bucket is required and supplies the mode, sprint config, and
  sprint-speed context in 1.0. Do not show separate History mode or speed chips
  while the view is scoped to a single bucket.
- Source type distinguishes sprint attempts from official Scheduled Review attempts.
- History includes correct and wrong sprint attempts.
- History includes correct and wrong Scheduled Review attempts.
- History excludes Analysis Review exploration and retry moves.
- Each row should show result, source type, mode, puzzle rating, elapsed time, date, and review status.
- Row review status and difficulty must be resolved by the full attempt context
  (`puzzleId + mode + ratingKey`), not by `puzzleId` alone. The same puzzle can
  appear in multiple sprint modes or ELO buckets, and a queued review date from
  one bucket must never appear on another bucket's row.
- Tapping a row opens Analysis Review with original attempt context.
- Analysis Review launched from History supports retry, Stockfish analysis, and previous/next navigation through the current filtered History result set.
- Previous/next navigation from History follows the active filter result order, not just the currently visible page.
- History filters should be horizontally scrollable chips on phones.
- Failed attempts should clearly show whether they are already in the review queue.
- Performance chart belongs in History, not primarily in Sprint Results.
- Performance chart can switch between rating trend, wins/losses, accuracy, solved count, mistake rate, and review due volume.
- Performance headline stats and chart series use the full filtered time range.
  Pagination affects only the visible attempt rows, never the headline metrics
  or chart inputs.
- Statistics are grouped separately by the selected ELO bucket for Standard,
  Blitz, Arrow Duel, theme sprint, and custom sprint speeds.
- Mistake statistics are also grouped separately by sprint type, speed, theme, and review state.

### Sprint Results

- Results should stay action-oriented and compact.
- Show win/loss, reason, solved count, mistakes, time, best streak, rating before/after, rating delta, review queue impact, Play Again, and Review Mistakes.
- Do not make the rating performance chart the main result view; link to History for deeper trend analysis.

### Settings

- Local Data appears near the top with clear on-device storage copy.
- ELO reset is explicit and separate from deleting history.
- Advanced manual ELO adjustment should be hidden behind an "Advanced ratings" affordance.
- Settings must not include simulated cloud state in v1: no iCloud toggle, no upload approval prompt, and no fabricated "last synced" timestamp.
- Real CloudKit sync is post-1.0 and must add a real transport, entitlement, merge engine, and truthful UI state before any sync controls are shown.

### Review Reminder Notifications

Daily local notifications remind the user when scheduled reviews are due. No
push infrastructure: everything is computed on device from the local review
queue.

Scheduling rules:

- At most one reminder per day, and only when at least one review item will be
  due at the reminder time. Zero due items means no notification.
- The reminder time defaults to a smart time: the hour the user most often
  trains, derived from local attempt history (median session start hour over
  the trailing 14 days, minimum 5 sessions). Until enough history exists, fall
  back to 19:00 local time.
- The user can override the smart default with a fixed time, or disable
  reminders entirely, from a Notifications section in Settings.
- The notification copy includes the due count, for example "12 puzzles are
  ready for review". Tapping it opens the Review tab.
- The next reminder is (re)scheduled whenever the review queue changes and when
  the app backgrounds, using the projected due count at the reminder time
  (computable locally from stored `dueAt` timestamps).

Permission flow:

- Do not request notification permission at first launch. Ask contextually:
  after the first review session completes (value already demonstrated), offer
  enabling reminders with a one-line explanation, then trigger the iOS
  permission prompt.
- If permission is denied, the Settings row shows the disabled state with a
  link to system settings. Never re-prompt automatically.

Architecture:

- The decision "what reminder should be scheduled next" (time, due-count copy,
  or none) is computed in the domain core from the review queue, usage
  history, and notification settings, and is unit-testable in Node.
- The platform notification API (UNUserNotificationCenter) sits behind an
  interface with a maintained fake, matching the repo boundary rules.

### Packs

V1 scope note: pack downloading, import, and removal are deferred beyond v1
(see `docs/APP_STORE_PLAN.md`). V1 ships a bundled puzzle pack only; the
Packs screen shows the bundled pack, its coverage, and license/source
attribution. The requirements below describe the full post-v1 feature.

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
- `settings-local-storage`
- `settings-reset-elo`
- `packs-installed-core`
- `packs-import` (deferred beyond v1 with pack downloading)
- `packs-remove` (deferred beyond v1 with pack downloading)
- `packs-license-notes`

Accessibility rules:

- Do not rely on color alone for correct/wrong states.
- Dynamic timer changes must not spam screen readers.
- Board coordinates and selected squares need accessible descriptions in review mode.
- Destructive confirmations must identify what will be reset or deleted.
- Local-only storage status must be readable as text, not only as an icon.

## Testing Implications

- Every core screen must expose stable accessibility labels for Detox.
- Component tests should verify user-visible behavior, not component internals.
- UI should receive view models from backend/domain packages; React components must not compute sprint outcomes, ELO updates, review scheduling, or Arrow Duel correctness.
- E2E flows should cover Practice start, Arrow Duel choice, wrong-answer review, custom sprint setup, history filtering, pack management, ELO reset, and local data export/delete.
- Design QA should include iPhone SE-sized viewport, modern iPhone portrait, and at least one landscape/tablet sanity pass.
- E2E assertions should target stable labels/test IDs from this document.

## Open Design Questions

- Whether Arrow Duel candidate chips should display SAN only, coordinate notation only, or both.
- Whether manual ELO editing should ship in v1 or only reset/import/export.
- Whether custom max mistakes is part of v1 custom sprint or should remain fixed by scoring mode.
