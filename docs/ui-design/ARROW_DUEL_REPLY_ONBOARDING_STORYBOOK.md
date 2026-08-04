# Arrow Duel Reply Onboarding

Status: approved Storybook design with production wiring in PR #506. The
Interaction Lab remains the living visual reference for the implemented guide,
preparation cue, and side-specific reply prompt.

## Problem

Opponent reply is now the default Arrow Duel behavior, but the first-use guide
still compresses the choice and reply into one explanation. A new player can
choose between the arrows without learning the handoff that follows: the board
rewinds, the other move is played, and the player must answer for a named side.

The preparation cue and the ready prompt also use generic wording. Neither one
makes White or Black explicit, so the player has to infer who should move from
the board alone.

## First-use sequence

Keep the four shared Active Session guide screens unchanged. Replace the one
Arrow Duel screen with two responsive screens:

1. **Choose the stronger move**
   - Show the two legal candidate arrows: `Qg7#` and `Qe8+`.
   - Explain that a correct choice rewinds the board and plays the other,
     tempting move.
2. **Then reply for Black**
   - Show the resulting position without candidate or answer arrows.
   - Highlight the other move as the last move.
   - Use the real side glyph and the side-specific ready prompt.
   - Explain that the reply is requested only after a correct choice to test
     the player's understanding of the counterplay, then give the 10-second
     reply limit.
   - Explain the mistake and Review consequence without introducing partial
     scoring.

The guide does not expose the familiarity-timing progression. Its three timing
states remain available as separate Storybook cue stories for design review.

The named side is fixture-driven in Storybook and must be derived from the
position in production. Black is not a hard-coded product rule.

## Copy

Preparation cue:

- Visible title: `What would [Black king glyph] play after the other move?`
- Accessible title: `What would Black play after the other move?`
- Supporting line: `You’ll have 10 seconds to play the best reply.`

Ready prompt:

- Title: `Find Black’s reply`
- Context: `The other move was played.`

The shared king glyph changes to White when White is the replying side, while
assistive technology receives the full side name. The supporting line retains
the configured reply duration and directly tells the player what to do once the
board is ready. Future tense keeps clear that the reply clock has not begun on
the preparation cue.

## Preparation progression

The first-ever cue requires an explicit acknowledgement, then passive display
time decreases as the player becomes familiar with the handoff:

- First-ever cue: remains visible until the player taps `Got it`.
- Later cues in that first Sprint and the next Arrow Duel Sprint: 1.5 seconds.
- Third and later Arrow Duel Sprints: 1 second.

The completed familiarity stage is persisted as device-local guide progress.
Reset guides restores the first-ever `Got it` state along with every other
first-use guide. Scheduled Review and Replay reuse the approved side-specific
copy; Sprint familiarity controls only the Sprint preparation cue.

## Terminal alternative rule

The reply phase exists only when the other move leaves a legal reply. After the
player chooses the correct move, the design checks the position produced by the
alternative move before showing the preparation cue:

- If the alternative position is playable, continue to the preparation cue and
  reply countdown.
- If it is stalemate, pass the puzzle and advance directly to the next puzzle.
  Do not show the `After you choose correctly…` guide copy, preparation cue,
  `Got it`, reply prompt, countdown, or reply-timeout path.

The worse alternative cannot be checkmate: a checkmating move would not be the
worse candidate. The boundary case is therefore explicitly stalemate-only.

The implementation acceptance case uses `Qg7#` as the correct choice and `Qf7`
as the stalemating alternative. Core, Sprint, and rendered component regressions
cover this rules-only boundary. It has no standalone Storybook scenario because
the player sees the existing correct-feedback handoff and the next puzzle, not a
distinct interaction.

## Responsive contract

- Phone portrait: keep the board unobscured; put the callout below it; preserve
  44-point Back, Next, Start, and Exit targets.
- Phone landscape: keep the board and control rail side by side; place the
  callout in the board's empty lower lane; do not let its connector resemble a
  third candidate arrow.
- iPad portrait and landscape: preserve the same hierarchy rather than
  expanding copy to long desktop line lengths.
- Compact 320-point width and increased text scale: allow body copy to wrap and
  never clip the side-specific prompt or its countdown.
- The full-board cue must remain centered and balanced with a two- or three-line
  title, a shorter supporting line, and no forced line break tied to one device.

## Storybook reference

The Interaction Lab keeps the approved two-step guide and side-specific copy as
deterministic visual references. The first-cue story exposes the real `Got it`
interaction. The 1.5-second and 1-second cue stories stay frozen so each state
can be reviewed without racing the production timer. The production flow owns
the persisted familiarity counter and Reset-guides behavior. Alternate-mate
acceptance and stalemate bypass remain implementation rules with automated
coverage, not separate Storybook pages.
