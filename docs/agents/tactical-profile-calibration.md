# Tactical Profile Calibration Handoff

This runbook activates Tactical Profile calibration without weakening its
representative-data, holdout, or human-review gates. Calibration is a local
development workflow. It is not a product API or a user-facing export flow.

## Required inputs

- One or more private JSON progress exports. Each file may contain one canonical
  `LocalDataExport` object or an array of exports.
- The exact Core Pack v3 SQLite file at
  `fixtures/puzzles/bundled-core-pack.sqlite`.
- The matching checked-in manifest and predeclared V1 calibration policy.
- An owner decision for whether the combined corpus is representative.

Keep progress exports, reports, and working evidence under `scratch/`; that
directory is ignored by Git. Do not use synthetic fixtures, automated-test
simulators, or hand-authored attempt rows as representative production
evidence. Do not commit private progress exports.

Fetch and authenticate the immutable Core Pack before calibration:

```sh
pnpm fetch:core-pack
```

## First pass: create the report and review template

Create a new working directory, then run the harness with every approved input
export. Repeat `--progress` for additional files.

```sh
mkdir -p scratch/tactical-profile-calibration
pnpm calibrate:tactical-profile \
  --progress scratch/tactical-profile-calibration/progress-1.json \
  --pack fixtures/puzzles/bundled-core-pack.sqlite \
  --manifest fixtures/puzzles/bundled-core-pack.manifest.json \
  --policy config/tactical-profile-calibration-policy-v1.json \
  --report scratch/tactical-profile-calibration/report-first-pass.json \
  --artifact scratch/tactical-profile-calibration/artifact-first-pass.json \
  --decision-template scratch/tactical-profile-calibration/decision-evidence.json
```

The generated decision template is authenticated to the exact pack file,
canonical corpus, policy, and decision-relevant analysis output hashes. The
harness creates it once and refuses to overwrite it. Every decision starts as
`null`, so the template cannot be reused as completed evidence without explicit
review. Do not edit any hash. If calibration code or its analysis output changes
between passes, generate a new first-pass template and review the new report.

Review the report separately for `line` and `arrow_duel`. The owner must decide
whether the corpus is representative, and the reviewer must replace every
`null` decision with a boolean:

- `candidateModelComparison`: the selected solve and speed models beat or
  justify rejection of their predeclared alternatives on holdout data.
- `timeoutPolicyStratification`: train and holdout results cover the required
  Timeout-policy cohorts without an unaddressed policy effect.
- `residualInfluencePolicy`: speed residual tails and influential observations
  have an accepted treatment.
- `heteroscedasticityPolicy`: changing residual spread has been assessed and
  either modeled or explicitly accepted.
- `priorCalibration`: solve and speed prior scales are supported.
- `practicalThresholdCalibration`: practical deficit and confidence thresholds
  are supported.
- `opportunityTransformCalibration`: the opportunity weighting and exponent are
  supported.
- `actionUtilityCalibration`: recommendation and watch cutoffs are supported by
  the intended training utility.
- `focusedRunPolicyCalibration`: rating bands, recency exclusion, quota mix, and
  sparse-theme fallback are supported.
- `homeLeadCalibration`: the Home summary ordering and lead recommendation
  policy are supported.

Set a unique, non-empty `decisionId` that identifies the reviewed decision
record. A `false` decision is valid evidence of review, but it keeps that family
unavailable and is reported as explicitly rejected rather than incomplete.

## Second pass: activation candidate

Only after the review is complete and the owner approves the corpus as
representative, rerun the same exact inputs with the reviewed evidence:

```sh
pnpm calibrate:tactical-profile \
  --progress scratch/tactical-profile-calibration/progress-1.json \
  --pack fixtures/puzzles/bundled-core-pack.sqlite \
  --manifest fixtures/puzzles/bundled-core-pack.manifest.json \
  --policy config/tactical-profile-calibration-policy-v1.json \
  --report scratch/tactical-profile-calibration/report-reviewed.json \
  --artifact scratch/tactical-profile-calibration/artifact-reviewed.json \
  --decision-evidence scratch/tactical-profile-calibration/decision-evidence.json \
  --representative-owner-approved \
  --require-all-families-ready
```

`--require-all-families-ready` refuses to write the activation artifact unless
both Line and Arrow Duel pass the predeclared readiness gates. The reviewed
report is still written when a family fails so its reasons can be inspected.
Never change the predeclared policy after looking at the final holdout merely to
make a failed result pass.

When both families pass:

1. Review the report's missingness and family readiness reasons one final time.
2. Replace
   `config/tactical-profile-calibration-report-v1.json` and
   `config/tactical-profile-calibration-artifact-v1.json` with the reviewed
   outputs.
3. Run the root tests, typecheck, process validation, and the focused
   calibration test before publishing the activation commit.
4. Record the corpus scope, owner approval, decision ID, exact pack hash,
   validation results, and review checkpoint in the PR without including
   private progress data.

If the corpus is absent, unrepresentative, too small, missing required Timeout
cohorts, or fails a holdout gate, leave the checked-in artifact unavailable and
collect more real evidence. Existing user history does not need to be rebuilt:
canonical attempts and Sprint sessions can be scanned once against the exact
pack by this harness.
