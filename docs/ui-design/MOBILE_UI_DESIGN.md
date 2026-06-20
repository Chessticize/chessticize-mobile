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

## Mobile Information Architecture

Use a four-tab app shell:

- Practice: quick start, active session, custom sprint setup, and Arrow Duel entry.
- Review: due mistake reviews and spaced repetition queue.
- History: attempts, sprint sessions, filters, and "Wrong in the last 7 days".
- Settings: iCloud sync, local data, ELO reset, puzzle packs, licenses, and advanced rating adjustment.

There should be no mobile Home tab and no Game Review tab in v1.

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

## Core Screen Drafts

### Practice Session

![Mobile practice wireframe](assets/mobile-practice-wireframe.svg)

Practice session layout:

- Top session bar: mode, ELO, progress, timer, mistakes, and exit.
- Board gets most of the screen and remains visually stable.
- Prompt and action area live below the board.
- Regular puzzles use board moves as the primary input.
- Arrow Duel uses board arrows plus two candidate action chips below the board when needed.

### Arrow Duel Review

![Mobile Arrow Duel review wireframe](assets/mobile-arrow-duel-review-wireframe.svg)

Arrow Duel review behavior:

- Always show both original candidate arrows after review.
- Correct Stockfish best move is green.
- Blunder or inferior candidate is red.
- User's original choice gets an additional marker.
- If the user chose wrong, automatically play the opponent response or punishment line.
- Prefer stored puzzle solution lines for explanation; fall back to local Stockfish when the stored line is not enough.

### Custom Sprint Setup

![Mobile custom sprint setup wireframe](assets/mobile-custom-config-wireframe.svg)

Custom sprint layout:

- Use a focused setup screen or bottom sheet rather than a desktop-style page.
- Keep mode, theme, duration, and per-puzzle time as compact controls.
- Show computed puzzle count and ELO type as a live summary.
- Show previous configs below the setup area as compact reusable rows.

## Screen-Level Requirements

### Practice

- Default entry opens Practice, not a landing page.
- Quick choices: Standard Sprint, Arrow Duel, Blitz, Custom.
- Current ELO appears near each mode, but detailed rating management stays in Settings.
- The active session should remain readable at small phone widths.
- Abandon must be visible but visually secondary.

### Review

- First screen shows due mistake count and starts review immediately.
- Filters include due, overdue, failed again, Arrow Duel only, and theme.
- Review should reuse the same board surface as Practice.
- Correct reviews increase interval; failed reviews shorten interval.

### History

- Quick filters include "Wrong in the last 7 days", mode, theme, rating range, and sprint config.
- Each row should show result, mode, puzzle rating, elapsed time, date, and review status.
- Tapping a row opens review with original attempt context.

### Settings

- iCloud sync toggle appears near the top with clear local-first copy.
- ELO reset is explicit and separate from deleting history.
- Advanced manual ELO adjustment should be hidden behind an "Advanced ratings" affordance.
- Puzzle pack management and license notices are required for offline/open-source distribution.

## Testing Implications

- Every core screen must expose stable accessibility labels for Detox.
- Component tests should verify user-visible behavior, not component internals.
- UI should receive view models from backend/domain packages; React components must not compute sprint outcomes, ELO updates, review scheduling, or Arrow Duel correctness.
- E2E flows should cover Practice start, Arrow Duel choice, wrong-answer review, custom sprint setup, history filtering, ELO reset, and iCloud sync toggle.

## Open Design Questions

- Whether Practice should show the mode cards before every session or remember the last mode and offer immediate resume/start.
- Whether Arrow Duel candidate chips should display SAN only, coordinate notation only, or both.
- Whether manual ELO editing should ship in v1 or only reset/import/export.
- Whether iCloud sync should show first-run disclosure as a sheet or as a persistent Settings banner for the first session.
