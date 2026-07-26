# Tactical Profile / Training Focus Research Specification

Date: 2026-07-25; production-trial decision updated 2026-07-26

Scope: Issue [#250](https://github.com/Chessticize/chessticize-mobile/issues/250), research, approved Storybook design, and production-trial decision record

Current-main audit: [`aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a`](https://github.com/Chessticize/chessticize-mobile/tree/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a)

Design approval record: the owner approved the complete Phase A Interaction
Lab flow for implementation, and that approved design was merged as
[PR #341](https://github.com/Chessticize/chessticize-mobile/pull/341) at
[`f6ba30e`](https://github.com/Chessticize/chessticize-mobile/commit/f6ba30e).

This document is the durable product and statistical contract for the Phase A
Tactical Profile / Training Focus design. Later issue comments supersede earlier
proposals where they conflict. In particular, the accepted contract is the
[continuous-baseline V1 proposal](https://github.com/Chessticize/chessticize-mobile/issues/250#issuecomment-5081005179),
the later [product-semantics clarification](https://github.com/Chessticize/chessticize-mobile/issues/250#issuecomment-5081075589),
and the [final agreement](https://github.com/Chessticize/chessticize-mobile/issues/250#issuecomment-5081080052).

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. Numeric
values are classified as:

- **Normative product rule**: required behavior, not a tuning parameter.
- **Provisional V1 default**: the initial value if offline calibration does not
  reject it; it is not a scientific fact.
- **Calibration-required**: production must not freeze a value or functional
  form as validated until the local calibration harness supports it.

The original Phase A approval did not authorize production behavior. On
2026-07-26, after the available private history proved insufficient for a
representative holdout, the owner explicitly approved a provisional production
trial. The trial may use disclosed starting coefficients to learn from ordinary
mixed Runs, but MUST describe its output as an early estimate and MUST NOT
represent those coefficients or recommendations as validated. No analytics,
private-data upload, or sync payload is authorized.

## 1. Problem and product goals

The product problem is not to find the user's lowest raw theme percentage. It is
to identify theme-specific deficits that remain credible after accounting for
puzzle difficulty, task family, Run policy, repeated exposure, and uncertainty.
A useful profile must distinguish:

1. a lower probability of completing comparable puzzles within the clock; and
2. slower performance among puzzles that were completed correctly.

Those are independent signals. A user may be reliable but slow, unreliable at
an otherwise normal speed, weak on both dimensions, or not measurably weak.

The product goals are:

- detect statistically credible weaknesses without reacting to one rare miss;
- compare each attempt with a continuous, calibrated personal expectation;
- communicate evidence and practical impact without false precision;
- preserve the existing puzzle-specific Review flow;
- let the user preview and voluntarily start focused training;
- preserve mixed/control puzzles so one theme cannot monopolize a Run; and
- remain local-first, rebuildable, deterministic, and efficient for long
  histories.

Tactical Profile is a Practice product capability, not a History quick filter.
It belongs in the existing Practice product clone and must remain quiet during
an active puzzle. The Phase A Storybook should show calm state and action copy,
not expose model internals as a dashboard.

One isolated mistake MUST reuse the ordinary collecting-evidence presentation.
The product may explain the general diversity rule inside Tactical Profile, but
it MUST NOT elevate one miss into its own Home status or imply that the user
made a special mistake that was "not worth" training.

## 2. Normative target semantics

These rules are normative even where current `main` differs:

| Attempt fact | Solve-rate / timed-completion head | Completed-puzzle speed head | Product action |
| --- | --- | --- | --- |
| Correct before the puzzle timeout | Success, exactly once | Eligible when raw elapsed time is reliable | No automatic mistake Review |
| Submitted wrong move | Failure, exactly once | Excluded | Enroll directly in Review |
| Puzzle timeout | Failure, exactly once | Excluded in V1 | Enroll directly in Review; do not also mark Unclear |

The statistical model MUST consume objective attempt facts and configured policy
values:

- result;
- raw elapsed time when reliable;
- stored Run Rating before the attempt;
- puzzle Rating and Puzzle Rating Deviation;
- task family;
- Run pace;
- configured Slow threshold; and
- configured puzzle Timeout threshold.

The model MUST NOT use `timingStatus`, `unclear`, or active Review membership as
a likelihood label or evidence-validity predicate. Those values describe policy
and workflow, not stable statistical truth. A Slow policy may mark a completed
attempt Unclear, so excluding Unclear attempts would selectively remove the
right tail that the speed head is intended to measure.

Unclear remains a separate state for a completed Sprint attempt that either the
user or the configured Slow policy considers insufficiently understood.
Changing Unclear MUST NOT change Tactical Profile and MUST NOT dirty weakness
aggregates. If a future product needs to discard interruption, accidental input,
or corrupted timing, it needs a separate explicit data-quality state.

Review membership, Unclear, Slow, Timeout, and model-derived weakness MUST remain
separate concepts. A timeout is both a user-visible Timeout and a product
mistake, but it enters the statistical evidence exactly once.

## 3. Current-main differences and prerequisite gaps

The following audit distinguishes reusable current infrastructure from target
behavior that is absent or contradictory. It is not authorization to fix these
gaps in the Phase A design PR.

### Reusable current infrastructure

- [`AttemptEvent`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/types.ts)
  already distinguishes `correct`, `wrong`, and `timed_out`, records source,
  session, mode, Rating-before, timestamps, optional `elapsedMs`, timing status,
  and Unclear state.
- [`SprintConfig` and `PracticeRunRecord`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/types.ts)
  already carry pace, per-puzzle Slow/Timeout policy, and selected themes.
- [`isAttemptMistake`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/attempt-outcome.ts)
  classifies both wrong and timed-out attempts as mistakes, and
  [`PracticeService`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/practice-service.ts)
  schedules mistake Review for that predicate.
- [`AttemptSource`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/types.ts)
  distinguishes ordinary Sprint attempts from scheduled Review attempts.
- The curated V1 scope is explicit in
  [`theme-catalog.ts`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/theme-catalog.ts).
- The bundled
  [`PuzzlePackManifest`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/puzzle-pack.ts)
  and
  [current manifest](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/fixtures/puzzles/bundled-core-pack.manifest.json)
  provide global and 100-point Rating-bucket theme counts.
- Canonical local export and iCloud sync already include attempts, Sprint
  sessions with optional configuration, ratings, Runs, and Review state through
  [`LocalDataExport`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/practice-store.ts)
  and
  [`progress-sync.ts`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/progress-sync.ts).

### Current-main gaps

1. [`buildTimeoutAttempt`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/sprint-session.ts)
   currently sets `unclear: true` for a timeout. The target is direct mistake
   Review without Unclear.
2. [`isUnclearAttemptEligible`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/attempt-clarity.ts)
   currently permits every Sprint outcome, including Timeout, to be toggled
   Unclear. The target must prevent product flows from conflating Timeout with
   Unclear.
3. [`PackBackedPracticeStore.getSessionMistakeReview()`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/pack-backed-practice-store.ts)
   prefilters only `wrong` rows, unlike the shared mistake predicate. This can
   omit Timeout from post-session mistake review even though direct scheduling
   occurs.
4. The accepted History research note still says Timeout is automatically
   Unclear. That statement in
   [`HISTORY_QUICK_FILTER_RESEARCH.md`](./HISTORY_QUICK_FILTER_RESEARCH.md)
   is superseded for target product semantics, although Phase A MUST NOT alter
   the accepted History presentation.
5. [`calculateSprintRatingChange`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/ratings.ts)
   rates one completed Sprint as one game against a same-rated system opponent.
   Its expected score is therefore 0.5 and it consumes neither puzzle Rating
   nor puzzle RD. It is not a reusable per-attempt predicted probability.
6. The `Puzzle` domain type has optional `ratingDeviation`, and JSON research
   fixtures retain it, but the shipped read-only SQLite pack schema and
   [`SQLitePuzzlePackSource`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/sqlite-puzzle-pack-source.ts)
   omit Puzzle Rating Deviation. The required baseline cannot silently replace
   it with a constant. Pack generation, schema, source mapping, and manifest
   feature identity are production prerequisites.
7. `elapsedMs` and timing status were added after older attempts existed.
   Migration code intentionally leaves legacy timing null. Timestamps MUST NOT
   be treated as reliable elapsed time until pause/background and legacy
   semantics have been validated.
8. Imported legacy attempts may have only a synthetic session with incomplete
   configuration. Missing Timeout or pace policy MUST be represented as unknown,
   not reconstructed from today's defaults or parsed from display copy.
9. The current History SQLite path joins attempts, sessions, and puzzles for the
   requested range and then applies several filters in TypeScript in
   [`getHistoryView()`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/storage/src/sync-sqlite-store.ts).
   It remains appropriate for interactive History, but Tactical Profile MUST
   NOT rescan that path on every open.
10. No calibrated per-attempt baseline, theme posterior, daily weakness cache,
    calibration harness, quota-aware Focused Run plan, or Tactical Profile
    service contract exists on current `main`.

## 4. V1 discovery cohort

Discovery MUST include only ordinary mixed or unfiltered Sprint attempts.

```text
include:
  source == "sprint"
  AND session configuration is ordinary mixed/unfiltered

exclude:
  source == "scheduled_review"
  OR session is theme-focused or otherwise target-selected
```

The classification MUST come from canonical session/Run configuration, not the
human-readable `ratingKey`:

- `themes` absent, empty, or containing only the catalog's `mixed` sentinel is
  mixed/unfiltered;
- any named theme selection is a focused intervention, even when a selected
  name is outside the V1 curated catalog;
- the task family is `arrow_duel` only when mode is `arrow_duel`; Standard,
  Blitz, and ordinary Custom line-solving modes belong to `line`;
- a missing session configuration is `unknown`, not automatically mixed.

Scheduled Review is a selected repetition of a puzzle already identified for
attention. Focused Runs are interventions whose separate Run Rating and selected
sample may absorb or obscure the deficit being measured. Both therefore belong
to a future recovery/mastery signal, not weakness discovery.

The profile SHOULD use recency weighting rather than destructively deleting old
evidence. The provisional V1 half-life is specified in section 15. No hard
history cutoff is approved; if a cutoff is needed for performance or validity,
calibration must select and disclose it.

## 5. Unit of analysis and multi-theme weighting

The V1 primary unit is:

```text
curated atomic theme x task family
```

The theme scope is the curated atomic catalog in
[`packages/core/src/theme-catalog.ts`](https://github.com/Chessticize/chessticize-mobile/blob/aeb0e1c24bcf84b9e8af2003ed25dc303d3f7d1a/packages/core/src/theme-catalog.ts).
Large presentation groups may summarize child themes, but MUST NOT become the
statistical unit. An individual puzzle remains the responsibility of Review.
Raw pack tags outside the curated catalog are not V1 model units.

For an attempt matching `k` distinct curated themes, each matched theme receives:

```text
themeWeight(attempt, theme) = 1 / k
```

The sum of all theme weights from one attempt MUST be at most one. Duplicate
tags are normalized before `k` is calculated. An attempt with no curated theme
may contribute to baseline calibration but contributes to no theme posterior.

This fractional attribution is deterministic and explainable; it does not claim
to identify causal effects when themes are correlated. A joint correlated-theme
model is deferred to V2.

## 6. Continuous calibrated solve-rate baseline

The solve-rate head predicts completion within the configured puzzle clock. It
is a new per-attempt model and MUST NOT reuse the current Sprint rating update
as though it were already an attempt probability.

For attempt `i`, begin with:

```text
success_i =
  1  when correct before timeout
  0  when wrong or timed_out

logit(p_i)
  = alpha[taskFamily_i]
  + beta[taskFamily_i] * g(puzzleRD_i)
      * (ratingBefore_i - puzzleRating_i) / 173.7178
  + timeoutPolicyEffect(timeoutAfterSeconds_i)
  + other covariates retained by calibration
```

`173.7178 = 400 / ln(10)` is the Glicko-to-logit scale conversion, not a tuned
threshold. `g(RD)` is the uncertainty attenuation in the official
[Glicko formulas](https://www.glicko.net/glicko/glicko.pdf). Glicko explicitly
models both Rating and Rating Deviation and uses them in expected outcomes; it
does not justify silently dropping Puzzle RD.

The task-family intercept is required because a Chessticize Run Rating is
calibrated to passing an entire Run, not to a 50% per-puzzle solve rate. The
Glicko-shaped slope MUST be calibrated because Run Rating and puzzle Rating are
different pools. The functional form for Timeout policy is calibration-required.

Candidate covariates include Run pace, Slow threshold, decision count, Run rule,
and side to move. They MUST NOT be added to production merely because they are
available. The harness must show a material out-of-sample residual improvement.
In particular, side to move is excluded by default.

Attempts with missing puzzle Rating, missing Puzzle RD, missing Rating-before,
unknown task family, or policy/configuration that cannot be represented by the
accepted baseline are invalid for this head. The harness may establish an
explicit calibrated `unknown-policy` stratum; production MUST NOT infer historic
policy from current defaults.

The model shape is related to a one-parameter item-response model: learner
ability and item difficulty enter a Bernoulli-logit response probability with an
intercept. Stan documents that structure in its
[item-response regression guide](https://mc-stan.org/docs/stan-users-guide/regression.html#item-response-theory-models).
The analogy supports the model family, not the numerical coefficients; those
remain Chessticize-specific calibration outputs.

## 7. Completed-puzzle speed baseline

The V1 speed estimand is deliberately narrow:

> slower than expected among correctly completed puzzles with reliable timing.

Eligible observations MUST be correct, completed before Timeout, uncensored,
and have a validated positive `elapsedMs`. Wrong and Timeout observations MUST
NOT enter this head. Unclear and Slow labels do not affect eligibility.

Use raw log elapsed time, not an arithmetic mean and not
`elapsed / perPuzzleSeconds`:

```text
z_i = log(elapsedSeconds_i)

z_i
  ~ Normal(
      speedFamilyIntercept[taskFamily_i]
      + relativePuzzleDifficultyEffect_i
      + decisionCountEffect(log(1 + userDecisionCount_i))
      + paceEffect_i
      + slowPolicyEffect_i
      + phi_theme,
      sigma[taskFamily_i]
    )
```

For line puzzles, user decision count is the number of solution-line moves the
user must supply after the app's deterministic opponent auto-moves. Arrow Duel
has one user decision. The exact transformations, interactions, variance model,
and retained covariates are calibration-required.

`phi_theme > 0` means longer completed-puzzle time than the matched baseline;
`exp(phi_theme)` is the time multiplier. Log time is a proposed V1 model, not an
assumption to hide: the harness must inspect residual skew, heavy tails,
heteroscedasticity, and influence of extreme observations. Reaction-time
research warns that transformations and outlier rules change inference and
should follow an explicit distributional model
([Ratcliff 1993](https://doi.org/10.1037/0033-2909.114.3.510)).

Excluding Timeout observations creates a completion-conditioned estimand and
can introduce selection effects. The configured Timeout policy must therefore
be a baseline candidate and the UI MUST use the qualified completed-puzzle
language above. If holdout calibration shows that this limitation makes the
speed signal misleading, production MUST disable the V1 speed recommendation
rather than present it as calibrated.

Timeout is mathematically right-censored time, as documented in Stan's
[censored-data likelihood guide](https://mc-stan.org/docs/stan-users-guide/truncation-censoring.html).
Modeling that survival contribution is intentionally deferred to V2 because V1
already counts Timeout once as a solve-rate failure.

## 8. Theme posterior approximation

Each task-family theme has two independent, zero-centered, partially pooled
effects. Partial pooling is required so rare themes shrink toward no effect
rather than inheriting an extreme estimate from one observation. Stan's
[hierarchical logistic regression](https://mc-stan.org/docs/stan-users-guide/regression.html#hierarchical-priors)
describes the continuum between complete pooling and separate unpooled
coefficients.

### Solve-rate theme effect

Define `delta_theme` as an Elo-equivalent ability offset, where negative is a
solve-rate weakness:

```text
eta_i(delta) = logit(p_i) + x_i * delta
x_i = g(puzzleRD_i) / 173.7178
delta_theme ~ Normal(0, tauSolve^2)

U = sum(weight_i * x_i * (success_i - p_i))
I = sum(weight_i * x_i^2 * p_i * (1 - p_i))

posteriorVariance = 1 / (I + 1 / tauSolve^2)
posteriorMean = posteriorVariance * U
```

The sums are evaluated around `delta = 0`. This is a one-step quadratic
score/Fisher or Laplace approximation, not an exact closed-form logistic
posterior. The prior scale and all baseline parameters are calibration-required.
Calling the model validated, or removing its early-estimate disclosure,
requires golden-fixture comparison with an exact one-dimensional Newton or grid
posterior. The owner-approved provisional production trial does not satisfy
that validation gate. Laplace methods are approximations based on posterior
curvature, not identities
([Tierney and Kadane 1986](https://doi.org/10.1080/01621459.1986.10478240)).

Fisher information, posterior variance, and explicit diversity guards are the
primary evidence measures. Raw attempt count or a weighted effective-count
shortcut MUST NOT replace them.

### Completed-puzzle speed theme effect

After the speed baseline and residual variance are frozen by calibration, daily
cells may retain additive Normal-regression sufficient statistics:

```text
residual_i = log(elapsed_i) - predictedLogElapsed_i
phi_theme ~ Normal(0, tauSpeed^2)

precision = sum(weight_i / sigma_i^2) + 1 / tauSpeed^2
posteriorVariance = 1 / precision
posteriorMean =
  posteriorVariance * sum(weight_i * residual_i / sigma_i^2)
```

Positive `phi_theme` is slower. Multi-theme fractional weighting applies
independently to both heads. The posterior does not become a recommendation
until the evidence, impact, and diversity gates in section 9 all pass.

## 9. Evidence / impact / action thresholds

The product MUST preserve three stages:

1. **Evidence** - is the effect statistically credible and supported by diverse
   puzzles and sessions?
2. **Impact** - is the posterior effect large enough to matter for comparable
   puzzles?
3. **Action** - is focused training valuable enough, after opportunity and
   diversity considerations, to prioritize?

### Evidence

For each head, compute posterior probability beyond a practical-effect
threshold. Recommendation additionally requires explicit minimum distinct
puzzle and session guards. A rare theme does not receive a different confidence
standard. The UI may show "Collecting evidence" when a watch threshold is
crossed or a diversity guard is incomplete, but it MUST NOT call that state a
detected weakness.

### Impact

Solve-rate impact MUST include both:

- posterior evidence for an Elo-equivalent deficit; and
- posterior expected completion-rate loss on a comparable puzzle distribution,
  such as excess failures per 100 puzzles.

A fixed Rating offset is insufficient by itself because the same offset produces
different absolute probability changes at different baselines.

Speed impact MUST use a posterior completed-puzzle time multiplier. Exact
Elo-deficit, probability-loss, and time-multiplier thresholds are
calibration-required.

### Action and combination

The two heads MUST NOT be collapsed into one raw average or use one head's
posterior percentage as the other's weight. A theme becomes recommendation-
eligible when either head independently passes its evidence and impact gates.
If both pass, the explanation may mention both.

Ranking several eligible themes requires a bounded action utility that combines
posterior expected product impact with natural opportunity and
recency/persistence. The owner-approved production trial may use the
versioned provisional artifact's utility only while the early-estimate
disclosure remains visible. Representative calibration must confirm or replace
its exact formula before the ranking is called validated or the disclosure is
removed. Storybook ranks remain illustrative fixture data rather than exact
posterior claims.

The UI should state the reason in plain language:

- "You complete these less reliably than comparable puzzles."
- "You solve these correctly, but more slowly than comparable puzzles."

It should show diversity in understandable terms, such as different puzzles and
sessions, while avoiding exact-looking posterior percentages. Confidence labels
are product states, not scientific measurements shown to arbitrary precision.

## 10. Rare-theme and natural-frequency behavior

Natural theme frequency MUST come from the bundled pack manifest, preferably
the Rating-bucket `themeCounts`, not from user history. User history is distorted
by Custom Runs, focused interventions, and Review.

Natural frequency affects training priority only:

```text
confidence = evidence from user outcomes
priority = calibrated impact x bounded opportunity weight x persistence/recency
```

It MUST NOT alter the posterior confidence that a theme is weak. Therefore,
common and rare themes with equal evidence have equal confidence but may have
different training priority.

One rare-theme miss MUST:

1. allow the individual puzzle to follow normal mistake Review;
2. leave the theme in insufficient-data or collecting-evidence state; and
3. not create a theme-focused Run.

V1 MUST NOT deliberately insert targeted diagnostic puzzles into the discovery
cohort. If later diagnostic sampling is introduced, it must be explicitly
tagged as intervention data and excluded from discovery unless a
selection-aware model is approved.

The exact Rating-bucket interpolation and bounded opportunity transform are
calibration-required. A hard multiplication by raw frequency is prohibited
because it can make rare but severe weaknesses unactionable.

## 11. Focused Run quota plan

Focused training MUST be represented as an explicit quota plan, not one ordinary
OR-theme query:

```ts
interface FocusedRunPlan {
  taskFamily: "line" | "arrow_duel";
  ratingAnchor: {
    ratingKey: string;
    rating: number;
  };
  reasons: Array<{
    theme: CuratedTheme;
    reason: "solve_rate" | "completed_speed" | "both";
    count: number;
  }>;
  mixedControlCount: number;
  minRating: number;
  maxRating: number;
  excludePuzzleIds: string[];
}
```

The plan MUST:

- cap the maximum share of any one theme;
- preserve a meaningful mixed/control allocation;
- use new puzzles near the relevant Rating range;
- avoid recently seen puzzles and immediate Review replays;
- query quotas separately and deduplicate by puzzle ID;
- count a multi-theme puzzle against only one quota in a single Run;
- backfill an unavailable theme quota without violating the maximum theme share;
- keep mixed/control puzzles so ordinary discovery continues outside the
  intervention; and
- let the user preview and decline the focused Run without changing the model.

For deterministic integer allocation, use largest-remainder rounding subject to
the maximum-theme and minimum-mixed constraints. If the requested Run size
cannot satisfy both, the planner MUST offer a larger valid Run or decline to
construct it; it must not silently drop the mixed/control guard.

Provisional allocation defaults are in section 15. For a 15-puzzle Run they
produce:

```text
one weakness:       10 primary / 5 mixed-control
two weaknesses:     9 primary / 3 secondary / 3 mixed-control
```

The exact Rating window, recently-seen interval, backfill order, maximum number
of simultaneous recommendations, and action-ranking formula are
calibration-required.

Phase A may show an in-memory Focused Run preview and a "Keep mixed" decline
action. It MUST NOT wire production selection or imply that a long-lived
suppression preference has been stored.

### Rating anchor and refresh lifecycle

Weakness discovery and puzzle delivery use Rating differently:

- discovery compares every attempt with the user's stored `ratingBefore` and
  the puzzle Rating from that attempt, so a later Rating increase does not
  suddenly invalidate older evidence;
- recency weighting gradually reduces the influence of older Rating contexts;
  and
- a new Focused Run anchors puzzle selection to the latest current
  mixed/unfiltered Run Rating for the same task family, never to a stale
  recommendation snapshot or a theme-focused intervention Rating.

The profile MUST incrementally re-evaluate after each completed eligible
mixed/unfiltered Run and after canonical import recomputation. User-visible
recommendation changes occur only at a session boundary. The quota planner MUST
rebuild the plan immediately before every new Focused Run using the latest
Rating, ranked recommendations, recent-puzzle exclusions, and inventory.

Once a Run starts, its Rating range, puzzle IDs, and quota allocation are
immutable. The app MUST NOT change the mix midway through the Run. Finishing a
Focused Run also MUST NOT make its selected sample look like independent
weakness-discovery evidence. Later ordinary mixed Runs determine whether the
focus still applies.

Entry and exit MUST use the versioned artifact's hysteresis so a recommendation
does not appear and disappear around one threshold. During the owner-approved
trial those values are provisional and remain covered by the early-estimate
disclosure; representative calibration must confirm or replace them before the
model is called validated. A completed Focused Run MUST NOT immediately
re-offer the same action without at least one new eligible ordinary mixed
session and a new profile evaluation. This is an action-freshness rule, not a
V1 recovery or mastery model.

### Focus and presentation cutoffs

The product MUST keep focus scarce:

- Practice Home shows only the clearest theme and summarizes the number of
  additional eligible recommendations;
- Tactical Profile shows at most the top three distinct themes and keeps lower
  ranked candidates in background monitoring; and
- one Focused Run trains at most the top two distinct themes.

Multiple statistical heads for the same atomic theme count as one presented
focus. If both heads pass, the explanation may mention both reasons. Ranking and
cutoffs happen after the independent evidence and impact gates; hiding a lower
ranked theme from the visible top three MUST NOT rewrite its posterior.

Task families remain separate presentation lanes as well as separate
statistical units:

- Puzzle solving and Arrow Duel share one Tactical Profile destination, with an
  explicit mode selector when both have eligible recommendations;
- the `1 / 3 / 2` Home, Profile, and Focused Run limits apply inside the
  selected task family rather than combining unlike recommendations;
- Practice Home still renders one Training focus card, names the lead
  recommendation's mode, and summarizes the other mode instead of adding a
  competing second card;
- a Focused Run contains puzzles from exactly one task family and anchors to
  that family's current Rating; and
- the same atomic theme MAY appear independently in both lanes because
  `theme x task family` is the model unit.

The product MUST NOT mix Puzzle solving and Arrow Duel recommendations into one
raw-score leaderboard or one Focused Run. The production policy for choosing
which mode supplies the single Home lead is calibration-required; Phase A
fixtures are illustrative and MUST NOT define that policy by array order.

### Current-Rating inventory gate

Statistical confidence and trainability are separate. A credible weakness MAY
remain visible even when the bundled pack cannot safely supply a Focused Run
near the current Rating, but the product MUST withhold the start action unless
the complete quota can be filled.

Availability planning MUST:

1. preflight natural inventory from manifest Rating-bucket theme counts;
2. perform an exact indexed availability check after recent and Review puzzle
   exclusions;
3. begin with the calibrated current-Rating band and widen only through a
   bounded, symmetric fallback approved by calibration;
4. preserve the maximum-theme and minimum-mixed constraints at every fallback;
   and
5. decline to construct the Run when the full plan remains unavailable.

The planner MUST NOT silently repeat recently seen puzzles, stretch beyond the
maximum accepted difficulty band, substitute a broad parent theme for the
detected atomic theme, or remove the mixed allocation. Ratings outside useful
pack coverage use the same gate rather than pretending the nearest available
bucket is Rating-matched.

This gate is necessary even in the current 1,389,240-puzzle pack. For example,
the current manifest contains only `4` `smotheredMate` puzzles at Rating
`2100–2199`, `1` `intermezzo` puzzle at `600–699`, `4` `interference` puzzles at
`600–699`, and `12` `mateIn4` puzzles at `600–699`. Global theme totals alone
therefore cannot establish local trainability.

### Runtime cost and feasibility boundary

The runtime design MUST remain bounded:

- profile updates process the attempts from newly completed or dirty days;
- profile reads rank the fixed curated catalog from daily cells rather than
  rescanning raw history;
- opening Profile compares cached per-family Rating and latest terminal Focused
  Run watermarks, then checks a bounded number of manifest buckets, without
  listing all sessions, attempts, Review rows, or exact puzzle candidates;
- cache rebuild and recovery use a dedicated canonical query returning at most
  the latest terminal Focused Run per task family, including zero-attempt Runs;
- import observers capture changed terminal Focused Run metadata for processing
  only after the canonical import transaction completes;
- the exact exclusion-aware inventory query runs only after explicit Preview
  intent and again immediately before Start; and
- a two-focus Run uses at most three bounded indexed selections: primary,
  secondary, and mixed.

The repository benchmark must continue to validate the exact `9 / 3 / 3`
orchestration, shared exclusions, cross-quota deduplication, and a mixed
allocation that excludes both focused themes. Desktop measurements are
feasibility evidence only; Phase B still requires sparse-inventory, large
recent-exclusion, and target-device validation before choosing a performance
gate.

On 2026-07-25, `BENCHMARK_ITERATIONS=100 pnpm
benchmark:multi-theme-query <pack>` ran against a retained bundled SQLite pack
whose manifest was byte-identical to the tracked manifest
(`SHA-256 7f1335f9fa3282480c88076c70157c19a8af38854edce3b980196aabbc0ed65e`).
The explicit `9 fork / 3 pin / 3 mixed` plan completed all `100` iterations with
zero failures and zero duplicate puzzle IDs. Median selection time was
`36.967 ms`, p95 was `45.482 ms`, and max was `46.166 ms` on the development
Mac. The five-theme generic selection median/p95 was `20.611 / 22.417 ms`.
These values support feasibility but are not production latency guarantees.

On 2026-07-26, the benchmark gained the production nested-band selection path
for the calibrated `±100 / ±200` Rating bands. An initial implementation using
`ORDER BY ABS(rating - anchor)` was rejected after a five-iteration median of
`541.950 ms`. The retained adapter performs bounded lower/upper index scans
behind each quota selection and merges them by distance. Against the
1,400,000-puzzle Core Pack v3, a ten-iteration run completed the primary,
secondary, and mixed nested-band selections in a median `31.599 ms`, p95
`37.687 ms`, and max `37.687 ms`, constructing an exact, cross-quota-unique
`9 / 3 / 3` allocation at both bands. This is repeatable feasibility evidence,
not a target-device latency gate.

## 12. Local-only incremental storage design

The target derived-cache design consists of:

```text
weakness_daily_stats
weakness_dirty_days
weakness_build_state
```

This is a design contract only; Phase A MUST NOT add migrations or tables.

### `weakness_daily_stats`

Use UTC `completedAt` calendar-day keys. A daily cell is keyed by at least:

```text
model version
pack feature hash
UTC completed day
task family
theme or baseline sentinel
```

Its exact numeric columns are frozen only after calibration, but it must retain
the additive solve score/Fisher terms and completed-speed Normal-regression
sufficient statistics required by section 8. It must also retain deterministic,
threshold-capped distinct puzzle and session ID sets per theme/day so diversity
guards can be resolved by unioning daily cells rather than scanning raw history.
If one day already reaches the guard, capping at that guard preserves the
Boolean decision; changing a guard requires a model-version rebuild.

Canonical daily cells are un-decayed. Apply recency weighting only at query time
so the half-life can change without rewriting history.

### `weakness_dirty_days`

When canonical imported or updated attempt/session facts change:

- mark the old affected UTC day dirty;
- mark the new day too when `completedAt` changed;
- if session configuration changes, mark every day containing that session's
  attempts dirty; and
- batch imports recompute each distinct dirty day once.

New immutable attempts MAY update a clean current day incrementally in the same
transaction as canonical progress. If any prerequisite is missing or a build is
in progress, mark the day dirty instead.

Changing Unclear alone does not dirty any day. A model-version, calibrated
coefficient, prior, feature definition, curated-theme catalog, or pack-feature
hash change triggers a full derived rebuild.

### `weakness_build_state`

Record at least model version, pack feature hash, calibration identity, build
status, dirty-day count, deterministic progress/watermark, and the last eligible
ordinary mixed session's Rating key and latest terminal Focused Run watermark
per task family. Import changes that alter, move, or disqualify either stored
anchor require a canonical derived rebuild before the state can survive restart.
Backfill newest days first so the UI may show a truthful partial "Building
profile" state.

Derived cells:

- are local-only;
- are not canonical progress;
- may fail or rebuild without rolling back a canonical progress write or import;
- are never exported or synced;
- can always be rebuilt from canonical attempts, sessions, and the matching
  bundled pack; and
- must converge to the same result after chronological, out-of-order, duplicate,
  or batched import.

Do not add the earlier permanent `attempt x theme` projection table unless
benchmarks show dirty-day recomputation and capped daily diversity sets are
inadequate. Do not claim recomputation is millisecond-scale without measuring a
pathological high-volume day and a bulk import.

Profile reads should sum a bounded number of day/theme cells, so their cost
depends on days and curated themes, not linearly on raw attempt count.

## 13. Calibration harness specification

Validated adoption and removal of the early-estimate disclosure require a
local-only development harness, expected to live behind the CLI/development
boundary rather than a product API. The owner-approved provisional production
trial remains explicitly disclosed until this gate passes.

### Inputs

The harness joins:

- canonical progress attempts;
- canonical Sprint sessions and their Run configuration;
- Rating-before stored on the attempt;
- Puzzle Rating, Puzzle RD, themes, and solution metadata from the bundled
  read-only pack; and
- pack manifest/hash identity.

A normal progress export alone is insufficient because it does not include all
pack metadata. The harness MUST report missingness by field and cohort. It MUST
NOT reconstruct elapsed time or policy silently.

### Split and reports

Use a time-based or whole-session holdout, never only the same observations used
for fitting. Report separately by task family and Timeout policy:

- reliability curves by predicted-probability or Rating-gap band;
- calibration intercept and slope;
- Brier score;
- log loss;
- sample and information totals;
- missing-policy, missing-RD, and unreliable-timing rates;
- residual behavior for candidate covariates;
- speed residual distribution, tail influence, and heteroscedasticity; and
- one-step theme posterior error against exact one-dimensional Newton or grid
  calculations.

Brier and logarithmic scores are proper probability-scoring rules; their
purpose and definitions are documented by
[Gneiting and Raftery 2007](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf).

### Decisions the harness must make

The harness determines:

- whether only a family intercept needs fitting;
- whether the Glicko-shaped slope also needs fitting;
- whether slopes differ materially by task family;
- the functional effect of configured Timeout policy;
- whether pace, Slow threshold, decision count, Run rule, side to move, or
  another covariate materially improves holdout calibration;
- prior scales for both theme heads;
- practical-effect and confidence thresholds;
- the speed residual family and influence handling; and
- acceptable one-step-versus-exact posterior error.

Every shipped coefficient, tolerance, and threshold must be emitted in a
versioned calibration artifact with input schema and pack-feature identity.
Go/no-go tolerances must be declared before evaluating the final holdout. If a
task family lacks adequate representative calibration evidence, it may use only
an explicitly owner-approved provisional artifact with the early-estimate
disclosure; otherwise that family remains "Collecting evidence" or unavailable.

### Production artifact handoff

The mobile app loads
`config/tactical-profile-calibration-artifact-v1.json` through the domain-owned
artifact validator and requires its pack-feature hash and predeclared policy
identity/hash to match the bundled Core Pack and V1 policy exactly. A validated
family must also carry the input schema, corpus hash, report hash, reviewed
decision-evidence identity, explicit representative-corpus approval, and a
passing family readiness result. The owner-approved provisional trial instead
requires an explicit decision-evidence identity, null corpus/report hashes,
`representativeOwnerApproved: false`, and a `provisional` family status. An
invalid artifact, missing decision, missing pack identity, policy mismatch, or
pack mismatch fails closed.
The repeatable two-pass operator workflow, authenticated decision template, and
activation checks are documented in
[`docs/agents/tactical-profile-calibration.md`](../agents/tactical-profile-calibration.md).

After an owner-approved representative corpus passes calibration, the local
harness writes the reviewed aggregate report and replacement artifact with
`--report config/tactical-profile-calibration-report-v1.json` and
`--artifact config/tactical-profile-calibration-artifact-v1.json`. Build tests
recompute the report and policy hashes, reconstruct the complete artifact from
the authenticated report, predeclared policy, and bundled pack, and require an
exact match. A hand-edited coefficient, threshold, or Focused Run parameter
therefore fails the build even when it remains finite. Replacing provisional
families with validated families is a data-only activation seam: no
product-code or test-code change is needed, and a task family that does not
pass its own gates remains unavailable.

The Phase A PR MUST NOT implement this harness unless a tiny pure local script
is separately needed to verify a research claim. It MUST NOT upload user data,
add telemetry, or add runtime behavior.

## 14. Privacy and sync boundaries

Canonical attempts, Sprint sessions, ratings, Runs, Review state, and user
settings retain their existing local export and optional private iCloud sync
behavior. Issue #250 MUST NOT add or change those payloads during Phase A.

Tactical Profile posteriors, daily sufficient statistics, dirty-day state,
profile-build state, recommendations, and Focused Run previews are derived
local caches. They MUST NOT:

- be exported in `LocalDataExport`;
- be uploaded through iCloud sync;
- become analytics or telemetry;
- be treated as canonical user progress; or
- require a Chessticize server.

After restore or sync on a new device, the device rebuilds its profile from the
canonical progress snapshot and the locally bundled matching pack. A pack or
model identity mismatch invalidates the cache and triggers a full rebuild.

A user's decision not to start a suggested Focused Run changes neither evidence
nor confidence. Phase A provides no persistent suppression state. Any future
cross-device suppression preference requires a separate product/privacy
decision.

## 15. Provisional defaults versus calibration-required values

### Normative product rules

| Value or rule | Classification | Meaning |
| --- | --- | --- |
| `1 / k` theme weight | Normative product rule | One attempt contributes at most one total theme observation |
| `173.7178 = 400 / ln(10)` | Normative mathematical conversion | Converts a Glicko Rating gap to natural-logit scale |
| Timeout contributes `1` solve-rate failure and `0` V1 speed observations | Normative product rule | Prevents double counting |
| UTC completed-day keys | Normative product rule | Makes rebuilds deterministic across time zones |
| At least `2` task families (`line`, `arrow_duel`) | Normative product rule | Prevents unlike tasks sharing one baseline |
| Home `1`, Profile `3`, Focused Run `2` | Normative product rule | Keeps the product focused while lower-ranked themes remain monitored |
| One Profile destination, separate task-family lanes | Normative product rule | Prevents unlike evidence, Ratings, and Runs from being mixed |
| Rebuild before each Run; freeze after start | Normative product rule | Tracks current Rating without changing an active session |
| Full current-Rating inventory gate | Normative product rule | Prevents unsafe widening, repeats, or loss of mixed practice |

### Provisional V1 defaults

These values are starting points, not scientific facts. They may be used in the
owner-approved production trial only with the early-estimate disclosure.
Representative holdout calibration must confirm or replace them before the
model is called validated or the disclosure is removed:

| Value | Classification | Intended use |
| --- | --- | --- |
| `0.75` posterior confidence | Provisional V1 default | Watch / collecting-evidence state |
| `0.90` posterior confidence | Provisional V1 default | Recommendation evidence gate |
| `0.97` posterior confidence | Provisional V1 default | Strong-evidence label |
| `4` distinct puzzles | Provisional V1 default | Diversity guard |
| `2` distinct sessions | Provisional V1 default | Diversity guard |
| `90` days | Provisional V1 default | Query-time recency half-life |
| `70%` primary / `30%` mixed-control | Provisional V1 default | One-weakness Focused Run |
| `60%` primary / `20%` secondary / `20%` mixed-control | Provisional V1 default | Two-weakness Focused Run |

### Owner-approved provisional trial values requiring validation

The checked-in provisional artifact supplies bounded trial values for these
terms. They are product experiments, not validated population truths, and must
remain behind the same early-estimate disclosure:

- solve-family intercepts and Glicko-shaped slopes;
- Timeout, pace, Slow-threshold, decision-count, and Run-rule effects;
- solve-theme and speed-theme prior scales;
- Elo-equivalent deficit threshold (30 Rating points was discussed, not
  approved as product truth);
- posterior expected completion-rate impact threshold;
- completed-puzzle time multiplier threshold (1.25 was discussed, not
  approved as product truth);
- speed variance/residual family and extreme-value influence policy;
- exact holdout calibration and approximation-error tolerances;
- natural-frequency interpolation and bounded opportunity transform;
- maximum analysis horizon, if any;
- recent-puzzle exclusion interval and Focused Run Rating band;
- recommendation exit threshold and ranking hysteresis; and
- multi-head action utility and ranking weights.

Storybook may use rounded illustrative fixture values, but it MUST label them as
illustrative through scenario documentation and MUST NOT present them as exact
posterior facts in user-facing copy.

## 16. Golden fixtures and behavioral acceptance tests

These cases are mandatory for later domain/storage implementation. Phase A
Storybook fixtures may present the corresponding user states, but do not execute
the model.

1. **One rare-theme miss:** one appearance and one miss can enroll the puzzle in
   Review but does not recommend the theme.
2. **Repeated diverse misses:** repeated misses across enough distinct puzzles
   and sessions can pass solve-rate evidence and impact gates and recommend the
   theme.
3. **Consistent completed-puzzle slowness:** all-correct but consistently slow
   reliable observations can produce a completed-speed weakness.
4. **One extreme slow solve:** one extreme correct elapsed time does not by
   itself recommend the theme.
5. **Timeout partition:** one Timeout contributes exactly one solve-rate failure
   and no V1 speed observation.
6. **Unclear inclusion:** identical objective attempts yield identical model
   evidence whether `unclear` is true or false.
7. **Unclear mutation:** toggling Unclear does not dirty daily weakness cells
   and does not change the Tactical Profile result.
8. **Multi-theme conservation:** a puzzle matching three curated themes
   contributes `1/3` to each and no more than one total observation.
9. **Scheduled Review isolation:** repeating a puzzle through scheduled Review
   changes recovery data only and does not amplify discovery weakness.
10. **Focused intervention isolation:** Focused Run data neither washes out nor
    rediscovers the original weakness.
11. **Frequency separation:** common and rare themes with identical user
    evidence have equal posterior confidence but different action priority.
12. **Import convergence:** chronological import, out-of-order import, repeated
    import, and one batched import converge to byte-equivalent daily aggregates;
    every dirty day is recomputed once per batch.
13. **Version rebuild:** a model-version or pack-feature change followed by full
    rebuild matches a clean calculation from canonical progress and the pack.
14. **Large-history query:** after the cache is built, profile query work grows
    with retained daily/theme cells, not linearly with raw attempt count.
15. **Rating growth:** a new Focused Run uses the latest applicable ordinary
    mixed Rating while old evidence remains normalized by its stored
    `ratingBefore`.
16. **Active-Run immutability:** a Rating or recommendation change during a Run
    does not change that Run's puzzle IDs, Rating range, or quotas.
17. **Focus cutoff:** four eligible themes show one Home lead and at most three
    Profile recommendations; the Run contains at most two theme quotas.
18. **Sparse current-Rating inventory:** a credible theme remains an insight,
    but no start action appears when exclusions and bounded widening cannot fill
    the complete quota.
19. **Two task families:** one Home card can summarize recommendations in both
    modes, but the Profile selector, visible cutoffs, Rating anchor, and Focused
    Run remain specific to Puzzle solving or Arrow Duel.

Additional required boundary fixtures:

- missing legacy `elapsedMs` contributes no speed evidence;
- missing historic policy is not replaced by current defaults;
- a Slow, correct, Unclear attempt remains eligible for both solve success and
  speed evidence;
- a Timeout is in Review but not Unclear under target semantics;
- a puzzle with no curated theme can calibrate the baseline but no theme;
- an unavailable Focused Run quota preserves the mixed-control floor;
- a completed Focused Run is not re-offered before new eligible ordinary mixed
  evidence causes another evaluation;
- two different task families never share one theme posterior; and
- one-step score/Fisher results stay within the predeclared tolerance of exact
  Newton/grid results on weak, strong, balanced, and near-separation fixtures.

## 17. Explicit production prerequisites

Before Phase B can claim implementation complete:

1. Record explicit owner approval of the Phase A Storybook design.
2. Reconcile current Timeout/Unclear behavior with section 2 across core,
   storage, sync merge, History semantics, and post-session mistake Review.
3. Add Puzzle Rating Deviation to the shipped read-only SQLite pack schema,
   generator, source adapter, validation, and manifest feature identity; rebuild
   the protected pack artifact.
4. Define and test reliable-timing eligibility and unknown legacy policy
   behavior without timestamp reconstruction.
5. Implement the local-only calibration harness. A holdout-validated artifact
   is required before removing the early-estimate disclosure or calling the
   model validated; the owner-approved provisional trial is not a substitute.
6. Establish go/no-go thresholds for reliability, Brier score, log loss, speed
   residuals, and one-step posterior error.
7. Add pure domain contracts for cohort classification, weighting, both heads,
   evidence/impact/action gates, and quota planning.
8. Add real SQLite migrations and integration tests for the three derived-cache
   structures, dirty-day recomputation, idempotent import, rebuild, and
   high-volume benchmarks.
9. Keep derived caches out of export and iCloud sync and test that boundary.
10. Add production navigation and service wiring only after design approval,
    while retaining the approved Storybook scenarios as living documentation.
11. Add user-visible loading/building, insufficient evidence (including a rare
    one-off), no meaningful weakness, solve-rate weakness, completed-speed
    weakness, capped ranked weaknesses, limited-inventory, explanation, Focused
    Run preview, and decline states.
12. Run the risk-scoped core, storage, CLI, component, Interaction Lab, and
    release validation required by the repository testing architecture.

The owner-approved trial may ship before representative holdout calibration,
provided the provisional contract and early-estimate disclosure above remain
intact. Issue #250 must not claim validated calibration until every applicable
prerequisite passes.

## 18. Decisions intentionally deferred to V2

V1 intentionally defers:

- right-censored Timeout likelihood in the speed head;
- a joint model of correlated or overlapping themes instead of fractional
  attribution;
- parent/child theme correlation and automatic presentation collapse learned
  from data;
- targeted diagnostic sampling with selection-aware inference;
- recovery, mastery, retention, and relapse signals from scheduled Review and
  Focused Runs;
- side-to-move, device/background, or other covariates not proven material by
  V1 calibration;
- a permanent `attempt x theme` projection table;
- cloud-computed, server-computed, or population-level profiles;
- analytics or anonymized aggregate validation;
- cross-device synchronization of derived posteriors or recommendations;
- persistent recommendation suppression and its expiry/sync semantics;
- automatic Focused Run selection or rollout without a separate approved
  product implementation;
- replacing the accepted History or active puzzle-clock designs; and
- displaying exact posterior percentages or scientific-looking scores in the
  user interface.

V2 work must preserve the V1 invariants unless a later explicit product decision
supersedes them: objective-fact inputs, independent workflow metadata,
evidence-impact-action separation, confidence-frequency separation, intervention
isolation, deterministic rebuildability, and local-first privacy.
