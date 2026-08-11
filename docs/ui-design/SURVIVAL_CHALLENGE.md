# Survival Challenge Design

Status date: 2026-08-11
Issue: [#492](https://github.com/Chessticize/chessticize-mobile/issues/492)  
Phase: Approved Storybook design contract; production implementation in review.

## Product name and promise

The feature is named **Survival**. `Personal Best` is not a feature name; the
interface uses `best` and `new best` only for the score a player has reached.

Survival asks one concrete question: how many puzzles can the player solve at
one fixed level before the third mistake?

- One solved puzzle adds one point.
- The selected level stays fixed for the entire Run.
- The third wrong puzzle ends the Run normally.
- Rating never changes.
- There is no overall deadline or hard per-puzzle timeout.
- Puzzle active time counts up as context only. It never changes score,
  mistakes, best eligibility, tie-breaking, or `Unclear`.
- `Slow` is not a Survival scoring state. `Unclear` remains independent and
  does not add a mistake by itself.
- Survival has no decorative `S` icon or repeated `Unrated` badge. The
  first-use guide explains once that Rating stays unchanged.

## Best updates while a Run continues

A Survival best is the highest solved count the player has ever reached for
one `challenge type + level + rule version` key. It is monotonic within a Run,
so it becomes durable as soon as the solved count exceeds the previous best.

For example, if the prior best is 18, reaching 19 with one mistake immediately
saves 19 as the new best. The Run continues and may raise that best again.
Waiting for the third mistake would add delay without improving integrity:
future play can never reduce the already reached score.

- Active and paused Runs may own the current best.
- The dedicated Survival records page labels a best owned by a resumable Run
  as `best · in progress`.
- Pausing, leaving through Back, or restarting the app never revokes a best
  already reached.
- A solved-puzzle transaction must save the attempt, incremented score, and any
  new best atomically in the later production implementation.
- Puzzle and Arrow Duel bests remain separate, and different levels are never
  ranked against each other.

## Pause and leave

Back, Close, and the pause control pause Survival instead of discarding
progress immediately. Like an ordinary paused Sprint, the paused surface hides
the current puzzle and board so stopped active time cannot become free analysis
time.

- `Resume` reveals the same puzzle and continues active time.
- `Leave paused` returns Home while saving the exact hidden puzzle, board/ply
  state, Puzzle or Arrow Duel phase, score, mistakes, selection cursor, active
  time, level, and rule version.
- Active time stops while paused or backgrounded. A paused Run has no expiry.
- Backgrounding derives the same puzzle-hidden `Resume` / `Leave paused`
  surface from the authoritative paused Run state; foregrounding never leaves
  an unexplained blank session shell.
- Android Back and Predictive Back both preview and commit that same Survival
  pause surface while a Run is active.
- The Storybook interaction uses the same domain pause/resume transition as a
  Sprint: opening the puzzle-hidden pause surface freezes both Run and
  per-puzzle active time, and resuming shifts the active deadlines by exactly
  the paused duration.
- Resume returns to the same unresolved puzzle and phase, so pause cannot be
  used as a free skip.
- There is no manual `End Run` or `End & start over` action. Selecting the same
  type and level continues its existing Run, preserving its mistakes.
- Only the third mistake or a full-pool `Perfect clear` ends a Run.

V1 persistence is local to one device. Cross-device resume remains out of
scope until a conflict contract is designed.

## Levels and installed puzzle inventory

Survival uses the 16 levels supported by the current immutable Core Pack:

`600–699`, `700–799`, `800–899`, `900–999`, `1000–1099`, `1100–1199`,
`1200–1299`, `1300–1399`, `1400–1499`, `1500–1599`, `1600–1699`,
`1700–1799`, `1800–1899`, `1900–1999`, `2000–2099`, and the capped final
level `2100–2200`.

The last level deliberately includes the pack's Rating-2200 rows. Survival
does not show `2200–2299`, `2300–2399`, or higher levels until a pack that can
support them ships.

- The quick choices show the supported adjacent `Easier`, `Recommended`, and
  `Harder` levels.
- `More levels` shows every other supported level, not an arbitrary subset and
  not theoretical disabled levels.
- A Rating source above the pack ceiling recommends `Highest available level`
  at `2100–2200` and explains the clamp.
- Do not show raw puzzle counts in the ordinary picker. They describe pack
  capacity, not difficulty.
- V1 may keep one domain-owned `SURVIVAL_LEVELS` constant, validated against
  the versioned pack. Inventory counts must not be duplicated in React UI.

The current smallest pools still contain 47,980 Puzzle entries and 47,704
Arrow Duel-eligible entries, so no additional arbitrary inventory cutoff is
needed. See [Survival Puzzle Pool Research](./SURVIVAL_PUZZLE_POOL_RESEARCH.md)
for exact per-level counts and reproduction steps.

Within one Run, puzzle IDs do not repeat. If every eligible puzzle is consumed
before the third mistake, the Run completes successfully with terminal reason
`pool_cleared` and result `Perfect clear`. Selection, database, or decode
failures are recoverable errors and must never be mislabeled as a clear.

## Recommended level and Rating source

Survival does not synthesize a global Rating.

- Puzzle defaults to the built-in Standard Rating profile.
- Arrow Duel defaults to the built-in Arrow Duel Rating profile.
- Home visibility does not delete a built-in profile, its Rating, or its
  results. Survival therefore remains usable when every saved Run is hidden
  from Home.
- If Standard has no completed games, Puzzle Survival uses Standard's starting
  Rating 600 and says `Starting level 600–699`.
- When Home is empty, the source card explains that Standard remains the
  Rating source even though it is hidden from Home.
- `Use another Run` appears only when another active compatible mixed Run
  exists. A one-option picker is not shown.
- An explicit alternate source is remembered separately for Puzzle and Arrow
  Duel. If that saved source later becomes unavailable, preserve the choice
  and ask for a replacement instead of silently selecting another Run.
- While that source is unavailable, the Hub labels the saved choice as
  unavailable, disables `Start Survival`, and opens an explicit compatible-Run
  replacement picker. Choosing a replacement re-enables Start.
- The source changes only the suggested level. Survival does not inherit its
  timer and does not change its Rating.
- The source is not part of the best key. Different sources recommending the
  same level share that level's Survival best.

## Information architecture

Practice Home keeps one Survival module.

- With no paused Run, it introduces Survival and opens the setup Hub.
- With paused Runs, it shows the most recently touched Run plus an explicit
  count for the others.
- A newly reached best is labeled `New best saved` even while the Run remains
  paused and resumable.
- The paused summary is one whole-card button into the Hub. Home never resumes
  Survival directly; `Continue` appears only beside the exact saved Run inside
  the Hub.

The full-page Survival Hub starts at the top, uses Back rather than Close, and
contains:

1. All in-progress Runs for the selected type, sorted by last touched.
2. Puzzle or Arrow Duel.
3. Recommended Rating source, with `Use another Run` only when useful.
4. Supported adjacent levels and every remaining level under `More levels`.
5. One compact summary with no time limit and a three-mistake end condition.
6. One `Survival records` entry summarizing completed and in-progress Runs.

The adjacent selected level uses the short label `Recommended`, avoiding
character-level wrapping on supported phone widths.

If the selected type and level already has an in-progress Run, the Hub action
says `Continue Survival`; it never offers a reset that discards mistakes.
Otherwise, Start carries the exact selected challenge type, level, Rating
source, source Rating snapshot, and level-specific best into the first-use
guide and the active Run. The guide never reverts to the Hub defaults.
Rules and first-use-guide detours preserve the selected type, Rating source,
and level when the user returns to the Hub. Back from the Rating-source picker
dismisses only that picker before Back can leave the Hub.

`How it works` on Home and `?` in the Hub are informational entries. Their
primary action is `Got it`; it returns to the originating Home or Hub without
starting or resuming a Run. Only an unseen first-use guide reached after an
explicit `Start Survival` intent retains `Start Survival` and `Not now`.

All Survival disclosures use the same short motion contract instead of
appearing or disappearing abruptly:

- Hub `In progress`, records-page `In progress`, and `More levels` are expanded
  or collapsed by a full-width labeled control with an animated chevron.
- Both `In progress` sections default open so resumable Runs remain prominent;
  `More levels` defaults closed unless the current deterministic design state
  explicitly demonstrates the full inventory.
- The content animates height, fade, and a subtle upward offset over 200 ms with
  an ease-out curve. Collapsed content remains mounted for a smooth transition
  but is hidden from accessibility and pointer input.
- The `More levels` control keeps spacing above its focus outline so browser and
  keyboard focus never touches the selected level card. The deterministic Hub
  preview opens the full inventory without a synthetic click, so it never leaves
  a review-only focus ring; real keyboard focus remains available.

At most one Run may be in progress for each
`challenge type + level + rule version` combination. Different combinations
may coexist without an arbitrary global cap.

Survival records do not appear as a large module inside general History.
History remains focused on individual puzzle attempts, filters, and replay.
The Challenge Hub opens a dedicated `Survival records` page that owns:

- In-progress Runs and any live best already reached.
- Separate Puzzle and Arrow Duel sections.
- One row per played level, including its completed-Run count and best.
- Recommended-level emphasis without ranking different levels against one
  another.

Back from records returns to the Challenge Hub, preserving the user's current
type, Rating source, and level selection.

## Arrow Duel

Arrow Duel is a separate Survival type and best namespace.

- Survival uses the global `Find the opponent's best reply` setting and does
  not add a second Survival-specific override.
- A new Run snapshots that global setting. Resuming a paused Run preserves the
  rule it started with so the exact puzzle state does not change underneath
  the user.
- When the setting is off, a correct candidate completes the puzzle and a
  wrong candidate adds one mistake and enters Review immediately.
- When the setting is on, a correct candidate continues to the required
  opponent reply. That reply has no countdown or timeout, matching Survival's
  no-time-limit contract.
- With the reply enabled, the puzzle scores only after both stages are correct.
  A wrong candidate or wrong reply adds exactly one mistake for that puzzle,
  never two; a wrong candidate never opens the reply step.
- Pause restores the exact candidate or reply phase.
- Candidate-only and candidate-plus-reply Runs share the same Survival level
  record because the global preference changes the interaction, not the
  challenge type.

## Data required by later implementation

Persist enough information to resume exactly and audit every best:

- Session ID, challenge type, rule version, status, and end reason.
- Selected Rating-source Run ID, Rating key/generation, Rating snapshot, and
  Rating Deviation snapshot.
- Locked level, pack version/hash, mode-specific eligible-count snapshot,
  selection seed, batch cursor, and compact no-repeat traversal state.
- Exact current puzzle, board/ply state, and Arrow Duel phase.
- Score, mistakes, attempts, current/best streak, active elapsed time,
  per-puzzle active elapsed time, pause count, sittings, pause timestamps, and
  wall-clock span.
- Best milestone ownership, including whether the owning Run remains active,
  paused, completed by three mistakes, or pool-cleared.
- Per attempt: puzzle ID/Rating/themes, outcome, submitted and expected moves,
  active elapsed time, `Unclear`, and Review context.

Production selection requires bounded batch refill with persisted deterministic
traversal state. The current finite Sprint preload must not be reused as if its
first empty batch proved full-pool exhaustion.

## Storybook boundary

The Interaction Lab demonstrates the expected Home, full-page Hub,
informational rules, Rating-source, unavailable saved source, highest-level,
empty-Home, first-use start, active,
puzzle-hidden pause, third-mistake result, full-pool `Perfect clear`, and
dedicated Survival records states. General History deliberately has no
Survival summary module.
The Interaction Lab remains presentation-only and continues to document the
approved states with deterministic fixtures. Production wiring lives outside
the Lab in the shared domain, storage, service, and mobile presentation layers;
V1 still adds no cross-device resume, analytics, or native-module behavior.
