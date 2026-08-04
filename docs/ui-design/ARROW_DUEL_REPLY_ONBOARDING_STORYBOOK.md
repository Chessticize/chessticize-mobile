# Arrow Duel Reply Onboarding Storybook Proposal

Status: Storybook review only. This proposal does not change production guide
eligibility, preparation-duration persistence, Sprint state, Review state, or
runtime answer handling. Product wiring begins only after explicit approval.

## Problem

Opponent reply is now the default Arrow Duel behavior, but the first-use guide
still compresses the choice and reply into one explanation. A new player can
choose between the arrows without learning the handoff that follows: the board
rewinds, the other move is played, and the player must answer for a named side.

The preparation cue and the ready prompt also use generic wording. Neither one
makes White or Black explicit, so the player has to infer who should move from
the board alone.

## Proposed first-use sequence

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

## Proposed copy

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

## Proposed preparation progression

The Storybook interpretation gives the first-ever cue an explicit
acknowledgement, then reduces passive display time as the player becomes
familiar with the handoff:

- First-ever cue: remains visible until the player taps `Got it`.
- Later cues in that first Sprint and the next two Arrow Duel Sprints: 1.5
  seconds.
- Fourth and later Arrow Duel Sprints: 1 second.

The progression is currently presentation data only. Approval is still needed
before deciding where the completed familiarity stage is persisted and how
Reset guides affects it. Scheduled Review and Replay must reuse the approved
copy, but their duration relationship to Sprint familiarity remains a product
wiring decision.

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

The dedicated Storybook boundary case uses `Qg7#` as the correct choice and
`Qf7` as the stalemating alternative.

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

## Storybook boundary

The Interaction Lab enables the two-step guide and side-specific copy through
design-preview inputs. Production defaults remain unchanged in this phase.
The first-cue story exposes the real `Got it` interaction. The later cue stories
are frozen for visual review and labeled with their proposed 1.5-second and
1-second stages; they do not implement the familiarity counter or persistence.
The dedicated `Arrow Duel · first reply cue · Got it` story is placed next to
the guide stories so the acknowledgement state can be reviewed directly.
