# Arrow Duel Opponent Reply Challenge

Status: implemented product contract and living Interaction Lab documentation.

Tracking issues: [#489](https://github.com/Chessticize/chessticize-mobile/issues/489)
and [#523](https://github.com/Chessticize/chessticize-mobile/issues/523).

This document defines the shipped Arrow Duel redesign across Core, storage,
sync, Review, Run management, CLI, and the mobile UI.

## Goal

Arrow Duel should distinguish a calculated choice from a correct guess. A
player demonstrates the tactic only by choosing the stronger candidate and
then finding the puzzle's refutation of the tempting candidate.

## Global And Run Settings

Settings has a device-local **Find the opponent’s best reply** preference. It
defaults to on. Turning it off removes the reply challenge from every Arrow
Duel Run without changing the saved preference or reply time inside any Run.
Turning it back on restores each Run's previously saved choice and time. The
global preference is never applied from a progress-sync payload, so an older
or second device cannot silently re-enable the challenge on this device.

Each Arrow Duel Run has an **Opponent reply** setting:

- It defaults to on.
- It appears in Edit Run only while the global preference is on. New Runs
  inherit the global default without showing a duplicate override during
  creation.
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

The effective behavior is `global preference on AND Run preference on`.
Neither layer rewrites the other.

First-use guidance and every Sprint or Review reply prompt end with the visible
escape hatch `Optional · Turn off in Settings`. The longer first-use callout
keeps **Optional** visually emphasized and appears on its own final line. When
the global preference is off, reply-specific guidance and prompts are omitted.

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
   starting square with a slower, silent undo. During that preparation beat,
   cover the board with a `What if you made the other move?` overlay and `Find
   the opponent’s reply in X seconds.`, where X is the Run's configured reply
   time. Keep the overlay through a 1.5-second preparation beat while the fixed
   prompt surface switches to the `If...` reply copy, then animate the tempting
   candidate under that same overlay. Dismiss it when the move settles. The
   player now moves for the opponent without the board flipping.
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
stays centered at the same full width and uses the single adaptive Prompt frame
contract defined in [`MOBILE_UI_DESIGN.md`](MOBILE_UI_DESIGN.md#adaptive-practice-and-review).
Arrow Duel must not declare a mode-specific height. Candidate and reply copy
occupy the same absolutely positioned copy layer so the handoff cannot change
the prompt's geometry. The reply state explains the position without restating
the acceptance rule. Once the whole puzzle resolves, do not replace that
prompt with `Solved`, `Choice
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

## Replay And Review

The Run setting governs every scored or reconstructed Arrow Duel attempt:

- With **Opponent reply** off, Sprint, Replay, and Review keep the original
  one-choice behavior.
- With it on, scheduled Review requires both the candidate and reply. The reply
  uses the same configured duration as the Run, and its countdown starts only
  after the 1.5-second `What if you made the other move?` handoff has completed
  and board input is available. A wrong candidate, wrong reply, or reply timeout records one
  failed Review attempt; both correct answers record one successful Review
  attempt. A timeout first shows the ordinary brief full-board `Timed out`
  handoff, then advances.
- Replay has no countdown. After a correct candidate, the player must find the
  opponent reply without guide arrows or live guided evaluation. After a
  correct reply, Replay continues through the stored puzzle line: the player
  remains the reply-side player and makes each remaining move for that side
  while the opponent replies automatically. Analysis remains available only
  when the player asks for it. Replay shows `Solved` only after that complete
  line has been played, or when an accepted immediate mate ends the position.
- If the candidate itself is wrong in Replay, keep the red feedback snapshot,
  then preserve the established guided punishment-line feedback: auto-play the
  opponent response and use the stored blue-arrow line to show why the move
  fails. Do not replace this feedback with the unassisted reply-side challenge.
- A Replay reconstructed from a persisted Sprint uses that Sprint's saved Run
  setting. A due Review uses the current setting for its Run. Neither path
  changes the Run's Rating identity, and Replay never writes History or changes
  the Review schedule.

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

- candidate choice and the staged green-confirmation, slow silent undo,
  full-board `What if you made the other move?` overlay with the configured
  reply time, `If...` prompt,
  and tempting-move handoff after a 1.5-second preparation beat;
- a board perspective locked to the original solver throughout the candidate
  and opponent-reply stages;
- the configurable opponent-reply state, defaulting to ten seconds and capped
  at thirty seconds;
- Standard-style brief board feedback and automatic advance for correct and
  wrong replies;
- the brief ordinary timeout overlay and automatic advance;
- Review enrollment for both failure stages without redundant result copy;
- the same configured reply countdown and visible `Timed out` handoff in
  scheduled Review, plus the untimed, unassisted reply-side full-line
  completion rule in Replay;
- the default-on Create Run and Edit Run control and its off state; and
- first-use Arrow Duel guidance for the two-stage rule.

These scenarios remain living UI documentation for the production behavior.
Their deterministic preview adapter is isolated from the production state
machine so Storybook timing can stay stable while the shipped flow exercises
the Core and storage boundaries.

All choice, reply, Review, Replay, guidance, and solved prompts follow the
shared Prompt frame contract in `MOBILE_UI_DESIGN.md`. Arrow Duel may change
copy or tone inside that frame, but it must not declare a mode-specific height
or remove one of the reserved title, context, and hint layout slots.
