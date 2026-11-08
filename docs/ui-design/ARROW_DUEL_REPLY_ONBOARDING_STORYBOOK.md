# Arrow Duel Reply Onboarding

Status: approved Storybook design with production wiring in PR #506. The
first-use guide was rebuilt as an overlay on the real session screen in #611.
The Interaction Lab remains the living visual reference for the implemented
guide, preparation cue, and side-specific reply prompt.

## Problem

Opponent reply is now the default Arrow Duel behavior, but the first-use guide
still compresses the choice and reply into one explanation. A new player can
choose between the arrows without learning the handoff that follows: the board
rewinds, the other move is played, and the player must answer for a named side.

The preparation cue and the ready prompt also use generic wording. Neither one
makes White or Black explicit, so the player has to infer who should move from
the board alone.

## First-use sequence

The first-use guide is a guided state of the real Arrow Duel screen (#611): a
dimmed scrim with a rounded cut-out around the current target, and one callout
whose Back · n of m · Next row sits inside it. The step set comes from
`sprintSessionGuidePlanFor` in `packages/core/src/sprint-guidance.ts`:

- A brand-new player sees three steps: the Sprint header, then the two Arrow
  Duel steps below. Finishing records only the Arrow Duel guide, so the first
  Standard Sprint still teaches the amber timer and Mark as unclear.
- A player who finished a Standard Sprint guide sees only the two Arrow Duel
  steps.
- With opponent reply off, the reply step is omitted.

1. **Choose the stronger move** (cut-out: the board)
   - Show the two legal candidate arrows: `Qg7#` and `Qe8+`.
   - Callout: `Two arrows, two candidate moves. Play the stronger one on the
     board.`
2. **Then reply for Black** (cut-out: the board)
   - Show the resulting position without candidate or answer arrows.
   - Highlight the other move as the last move; the prompt uses the real side
     glyph and the side-specific ready prompt.
   - Callout: `Next we play the other move. Find Black’s best reply in 10
     seconds. Sprint time pauses.`
   - Note line: `This extra challenge is optional — turn it off in Settings.`

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

The guide shows the session at its real size and layout, so it follows the
session's own responsive rules. A pure geometry function
(`apps/mobile/src/components/sessionGuideGeometry.ts`) places the callout:

- It tries the step's preferred sides (for the board: trailing, below, above,
  leading), flips to a side with room, and clamps the callout inside the Safe
  Area with each inset applied to its own edge.
- Across the placement axis it stays centred in the safe frame while its
  pointer can reach the target from there, so it does not move between steps.
  A target it cannot reach, such as a control in the iPad landscape side
  panel, gets the callout centred on it instead, so the callout stays in that
  column rather than straddling the board and the panel.
- The callout is up to 360 points wide, or 400 on regular-width windows.
- The callout sits 4 points from the cut-out. The pointer reaches into the
  cut-out's padding but never the target, so no caption or card edge shows
  between the callout and the highlight.
- When no side has room for the whole callout (large text on a small phone),
  it first shortens into the roomiest space above or below the target, keeping
  its title, at least one whole line of copy and the navigation, and the copy
  scrolls. Callout text follows the system size up to 1.4x, so this works at
  accessibility sizes; the session behind it scales fully. Only
  when even that does not fit does it cover part of the cut-out and hide the
  pointer.
- When a target sits below the visible screen (iPhone SE and the iPhone Duo
  outer display on the Mark as unclear step), the session scrolls with an
  animation and the cut-out and callout appear once it settles. A target
  clipped by the landscape side panel's own scroll view (Mark as unclear on a
  landscape phone) is scrolled into view there instead. A callout centred on a
  target near a screen edge keeps 8 points more from that edge.
- Back and Next sit in equal side slots so the progress stays centred when
  the two are close in width. Beside a much wider start label ("Start Arrow
  Duel") the progress centres in the gap between the buttons instead, and when
  the row cannot hold all three, Start wraps to its own row.
- A 2-point ring in `accent.s400` marks the cut-out edge. Dimming a black
  dark-theme canvas leaves it black, so the ring is what sets the target
  apart there.
- Back, Next and Start keep 44-point targets. Exit sits in the callout header,
  grows with the text size and keeps a 44-point hit area.

## Storybook reference

The Interaction Lab keeps the Arrow Duel guide steps and side-specific copy as
deterministic visual references. The first-cue story exposes the real `Got it`
interaction. The 1.5-second and 1-second cue stories stay frozen so each state
can be reviewed without racing the production timer. The production flow owns
the persisted familiarity counter and Reset-guides behavior. Alternate-mate
acceptance and stalemate bypass remain implementation rules with automated
coverage, not separate Storybook pages.
