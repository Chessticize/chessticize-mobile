# Arrow Duel Opponent Reply Challenge

Status: implemented product contract and living Interaction Lab documentation.

Tracking issue: [#489](https://github.com/Chessticize/chessticize-mobile/issues/489).

This document defines the shipped Arrow Duel redesign across Core, storage,
sync, Review, Run management, CLI, and the mobile UI.

## Goal

Arrow Duel should distinguish a calculated choice from a correct guess. A
player demonstrates the tactic only by choosing the stronger candidate and
then finding the puzzle's refutation of the tempting candidate.

## Run Setting

Each Arrow Duel Run has an **Opponent reply** setting:

- It defaults to on.
- It appears in Create Run and Edit Run when the Run format is Arrow Duel.
- Its reply time defaults to ten seconds and accepts any positive whole-number duration
  up to thirty seconds entered directly, rather than a fixed list of
  presets.
- Turning it off preserves the current one-choice Arrow Duel behavior.
- Turning it on or off does not change the Run's Rating identity. Both states
  contribute to the same Arrow Duel Run Rating.

The setting persists with the Run and syncs without changing its Rating key.
Legacy Arrow Duel Runs that do not yet have the setting receive the enabled
ten-second default during compatibility normalization and SQLite migration.
Runs that already store a reply duration keep their configured value.

## Scored Flow

With Opponent reply on:

1. Show the two neutral candidate arrows and ask the player to choose the best
   move.
2. A wrong candidate immediately makes the whole puzzle wrong. Do not ask a
   second question. Add the failed attempt to Review, show the ordinary brief
   red move feedback, and advance automatically.
3. A correct candidate does not complete the puzzle and does not reveal a
   solved result. Show the ordinary brief green move feedback, then pause the
   Sprint and puzzle clocks before beginning the handoff.
4. Keep the board in the original solver's perspective for the whole puzzle.
   After the green confirmation, animate the correct candidate back to its
   starting square and show a top-of-board `What if…` cue. Hold that preparation
   beat while the fixed prompt surface switches to the `If...` reply copy, then
   animate the tempting candidate. The player now moves for the opponent without
   the board flipping.
5. Start the Run's configured reply clock, which defaults to ten seconds, only
   after the tempting candidate has settled and board input is available. None
   of the green confirmation, undo, prompt transition, or move animation uses
   reply time. The reply phase and its board handoff do not advance the Sprint
   deadline, puzzle elapsed time, Slow threshold, or puzzle Timeout threshold.
6. The whole puzzle is correct only when both the candidate and reply are
   correct. Show the ordinary brief green move feedback, then advance
   automatically.
7. A wrong reply or reply timeout makes the whole puzzle wrong and adds the
   failed attempt to Review. A wrong move uses the ordinary brief red feedback;
   a timeout uses the ordinary brief `Timed out` overlay. Both advance
   automatically, and there is no partial-credit result.

The configured reply clock is prominent. Do not add a separate "Sprint paused"
label; the independent timing rule remains part of scoring behavior, while the
ordinary Sprint and puzzle clocks do not advance until the reply resolves.

The reply challenge reuses the ordinary puzzle prompt position and surface. It
stays centered at the same full width and fixed 72-point height. Candidate and
reply copy occupy the same absolutely positioned copy layer so the handoff
cannot change the prompt's geometry. The reply state explains the position
without restating the acceptance rule. Once the whole puzzle resolves, do not
replace that prompt with `Solved`, `Choice
missed`, `Reply missed`, Review messaging, or any other result copy. Match
Standard Sprint: the board feedback carries the result during the short handoff
to the next puzzle.

## Reply Judgment

The reply passes when either condition is true:

1. the normalized submitted move equals the next move in the stored puzzle
   main line; or
2. the submitted move is legal from the reply position and immediately
   checkmates.

Every other move is wrong, even when legal or close in engine evaluation.
Runtime judgment uses chess rules and stored puzzle data only. It must not run
Stockfish. Standard Puzzle, Arrow Duel reply, Replay, and Review should share
one Core acceptance rule so the legal-checkmate exception cannot drift between
surfaces.

## Core Pack Evidence

A deterministic stratified audit on August 3, 2026 sampled the current
1,392,969 Arrow Duel-eligible Core Pack rows across all sixteen Rating buckets
from 600 through 2200:

- 64 non-mate reply positions: the stored main-line reply ranked first in
  64/64 positions using Stockfish 18 at depth 18 with MultiPV 3. The smallest
  top-two difference was 229 centipawns, and no second move was within 100
  centipawns.
- 128 mate-in-one reply positions: the stored main-line reply checkmated in
  128/128 positions. Three positions had multiple legal immediate checkmates,
  with two, six, and two accepted mating moves respectively.

Stockfish was an offline source-data audit tool only. These results support the
stored-main-line plus legal-immediate-checkmate product rule; they do not add
an engine dependency to scored play.

## Interaction Lab Contract

The issue #489 design increment updates the existing product clones and keeps
their stable Storybook URLs. It covers:

- candidate choice and the staged green-confirmation, animated undo,
  top-of-board `What if…` cue, `If...` prompt, and tempting-move handoff;
- a board perspective locked to the original solver throughout the candidate
  and opponent-reply stages;
- the configurable opponent-reply state, defaulting to ten seconds and capped
  at thirty seconds;
- Standard-style brief board feedback and automatic advance for correct and
  wrong replies;
- the brief ordinary timeout overlay and automatic advance;
- Review enrollment for both failure stages without redundant result copy;
- the default-on Create Run and Edit Run control and its off state; and
- first-use Arrow Duel guidance for the two-stage rule.

These scenarios remain living UI documentation for the production behavior.
Their deterministic preview adapter is isolated from the production state
machine so Storybook timing can stay stable while the shipped flow exercises
the Core and storage boundaries.
