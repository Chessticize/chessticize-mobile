# Arrow Duel Opponent Reply Challenge

Status: approved product contract, Interaction Lab design phase only.

Tracking issue: [#489](https://github.com/Chessticize/chessticize-mobile/issues/489).

This document defines the planned Arrow Duel redesign. It does not describe
production behavior until the Storybook design is approved and the domain,
storage, Rating, Review, and mobile wiring ship in a later implementation.

## Goal

Arrow Duel should distinguish a calculated choice from a correct guess. A
player demonstrates the tactic only by choosing the stronger candidate and
then finding the puzzle's refutation of the tempting candidate.

## Run Setting

Each Arrow Duel Run has an **Opponent reply** setting:

- It defaults to on.
- It appears in Edit Run only when the Run format is Arrow Duel.
- Its reply time defaults to five seconds and accepts any whole-number duration
  from 1 through 60 seconds entered directly, rather than a fixed list of
  presets.
- Turning it off preserves the current one-choice Arrow Duel behavior.
- On and off configurations have separate Rating identity because they measure
  different task difficulty.

The Interaction Lab may hold this value in deterministic presentation state.
Production persistence, sync, legacy-Run migration, and Rating-key changes are
outside the design phase.

## Scored Flow

With Opponent reply on:

1. Show the two neutral candidate arrows and ask the player to choose the best
   move.
2. A wrong candidate immediately makes the whole puzzle wrong. Do not ask a
   second question. Add the failed attempt to Review.
3. A correct candidate does not complete the puzzle and does not reveal a
   solved result.
4. Play the tempting candidate on the board. Wait until that presentation is
   stable, then ask the player to move for the opponent.
5. Start the Run's configured reply clock, which defaults to five seconds. The
   reply phase and its board handoff do not consume the Sprint deadline,
   puzzle elapsed time, Slow threshold, or puzzle Timeout threshold.
6. The whole puzzle is correct only when both the candidate and reply are
   correct.
7. A wrong reply or reply timeout makes the whole puzzle wrong and adds the
   failed attempt to Review. There is no partial-credit result.

The configured reply clock is prominent. Do not add a separate "Sprint paused"
label; the independent timing rule remains part of scoring behavior, while the
ordinary Sprint and puzzle clocks do not advance until the reply resolves.

The reply challenge reuses the ordinary puzzle prompt position and surface. It
stays centered at the same full width and fixed 72-point height. The reply
state explains the position without restating the acceptance rule, and the
successful state shows only **Solved** on the neutral prompt surface.

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

- candidate choice and the correct-choice handoff;
- the configurable opponent-reply state, defaulting to five seconds;
- correct reply, wrong reply, and timeout outcomes;
- automatic Review messaging for both failure stages;
- the default-on Edit Run control and its off state; and
- first-use Arrow Duel guidance for the two-stage rule.

The design phase excludes production Sprint/domain behavior, persistent Run
settings, sync, Rating migration, Review mutations, native integration,
analytics, rollout, and release work. Explicit design approval must be recorded
before those boundaries are implemented.
